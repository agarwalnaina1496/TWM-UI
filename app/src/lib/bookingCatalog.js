import { routeStops } from './atlasView.js';
import { resolveTrustedAction, getTripFeasibility, searchFlights } from './tripApi.js';

// TWM-176/TWM-132: booking data built directly against the real Atlas
// schema shape (primary_location, day_number, timeline, kind,
// requires_advance_booking) — deliberately NOT reusing mockAtlasTrip.js's
// structurally different shape (cost_inr, base, number, items).
// Search/ranking/reasoning here (transportLegs/stayLegs) are
// permanent, pure route-derivation from Atlas days with no Backend
// dependency. TWM-132 is the transition promised in the old header comment:
// the terminal action (transportOptionsFor/feasibleTransportOptions/
// stayOptionsFor) now calls the real TWM-130/TWM-131 trusted-action and
// feasibility endpoints instead of returning mock MODE_TEMPLATE bands and a
// Google search URL — so every one of these is now async.

// TWM-146 follow-up: a small, closed city-name -> IATA lookup, so
// searchFlightOffer can actually populate origin_iata/destination_iata for
// major Indian cities instead of always falling through to
// clarification_needed. Deliberately scoped to cities that genuinely have
// their own airport with a well-known IATA code -- a hill town or
// non-airport destination (Alleppey, Coorg, Manali, Rishikesh, Spiti
// Valley, etc.) is left unmapped on purpose: attaching a "nearest airport"
// code would imply a direct-flight claim this app never actually makes, and
// the honest outcome for those is the Backend's typed clarification_needed
// (a traveler genuinely can't fly directly into a hill town). Case-
// insensitive exact-name lookup only, not a geocoder.
const CITY_IATA = {
  'delhi': 'DEL', 'new delhi': 'DEL',
  'agra': 'AGR',
  'jaipur': 'JAI',
  'mumbai': 'BOM',
  'bengaluru': 'BLR', 'bangalore': 'BLR',
  'kochi': 'COK', 'cochin': 'COK',
  'goa': 'GOI', 'panaji': 'GOI',
  'jaisalmer': 'JSA',
  'udaipur': 'UDR',
  'varanasi': 'VNS',
  'chennai': 'MAA',
  'kolkata': 'CCU',
  'hyderabad': 'HYD',
  'pune': 'PNQ',
  'amritsar': 'ATQ',
};

function iataForCity(name) {
  return CITY_IATA[(name || '').trim().toLowerCase()] || null;
}

export const MODES = ['flight', 'train', 'bus', 'drive'];
const MODE_LABEL = { flight: 'Flight', train: 'Train', bus: 'Bus', drive: 'Drive' };
export function modeLabel(mode) {
  return MODE_LABEL[mode] || mode;
}

// twm/schemas/trusted_action.py's TrustedActionDomain is only
// flight/train/bus/stay — "drive has no action of any kind" (its
// feasibility is purely computed distance/routing, never a partner
// handoff, per that schema's own docstring). Modes with no domain here are
// feasibility-only: never a trusted-action network call, never a CTA.
const DOMAIN_FOR_MODE = { flight: 'flight', train: 'train', bus: 'bus' };

// TWM-146 update to the note this replaces: flight's live-offer *data*
// (price/airline/stops/freshness) now comes from a real search
// (searchFlightOffer/POST /trips/{id}/flight-search, twm/schemas/
// flight_search.py's NormalizedFlightOffer), not from the trusted-action
// resolve at all. But NormalizedFlightOffer deliberately carries no url
// (twm/schemas/flight_search.py's FlightProviderProvenance docstring: "a
// live offer never doubles as a booking-authority action object") — so the
// flight card's actual clickable CTA still has to come from
// resolveTrustedAction, exactly as before. This module still requests
// action_type=SEARCH_REDIRECT (ixigo) for flight's CTA, per the backend
// contract's own framing of SEARCH_REDIRECT as flight's alternative/
// external-action path (CHECK_PRICES's internal_capability: "flight_search"
// has no external target to link to — see trusted_action/service.py — so
// switching the CTA request to CHECK_PRICES would only regress the CTA to a
// dead link now that searchFlights already covers CHECK_PRICES's data
// role). resolveFlightOption below fetches both concurrently and returns
// them as clearly separated concerns on one option object: `liveOffer`
// (search data, no url) and the existing resolved/url/affiliateDisclosure
// fields (the CTA) — never merged into one ambiguous shape.
const ACTION_TYPE_FOR_MODE = { flight: 'SEARCH_REDIRECT', train: 'SEARCH_REDIRECT', bus: 'SEARCH_REDIRECT' };

// Missing-field copy for a typed clarification_needed outcome — never a
// generic "error", always names what's actually absent
// (FlightSearchClarification.missing_fields).
const FLIGHT_MISSING_FIELD_LABEL = {
  origin: 'a departure city',
  destination: 'a destination airport',
  departure_date: 'your exact departure date',
  return_date: 'your return date',
  travelers: 'traveler count',
};

function flightMissingFieldsLabel(missingFields) {
  return (missingFields || []).map(field => FLIGHT_MISSING_FIELD_LABEL[field] || field).join(', ');
}

// FlightMoney.group_total_is_approximate is always true for the current
// provider generation (twm/schemas/flight_search.py) — the "approx."
// qualifier is a hard requirement, never dropped even when the field says
// true every time today.
function flightPriceLabel(money) {
  const amount = (money.group_total_minor_units / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${money.group_total_is_approximate ? 'approx. ' : ''}${money.currency} ${amount}`;
}

// Picks the Backend-ranked offer (NormalizedFlightOffer.is_recommended,
// TWM-145's ranking) as the card's primary content; falls back to the first
// offer defensively if none is flagged (should not happen per the backend
// contract, but never crash the card on that assumption).
function pickPrimaryOffer(offers) {
  return offers.find(offer => offer.is_recommended) || offers[0];
}

// Maps a FlightSearchResponse (status-discriminated) into the shape
// FlightLiveOfferCard renders — never conflated with AtlasReference
// evidence or a qualified Atlas cost estimate (TWM-144's contract keeps
// these structurally distinct; this mapping preserves that distinction by
// construction, not by convention).
function toLiveOffer(response) {
  const status = response.status;
  if ((status === 'offer' || status === 'partial') && response.offers?.length) {
    const offer = pickPrimaryOffer(response.offers);
    return {
      status,
      priceLabel: flightPriceLabel(offer.money),
      airline: offer.airline_name || offer.airline_code || null,
      stopCount: offer.stop_count ?? null,
      priceFoundAt: offer.price_found_at,
      offerExpiresAt: offer.offer_expires_at ?? null,
    };
  }
  if (status === 'clarification_needed') {
    return {
      status,
      message: response.clarification?.message || `We need ${flightMissingFieldsLabel(response.clarification?.missing_fields)} to search live flight prices.`,
      missingFields: response.clarification?.missing_fields || [],
    };
  }
  if (status === 'unavailable') {
    return { status, message: response.unavailable?.message };
  }
  // expired / failed: render safely, never raw provider/error data.
  return { status };
}

// Judgement call (TWM-146, documented per the story's instruction: "if
// exact date/traveler-count data genuinely isn't available at the call
// site today, that's fine"): transportLegs/routeStops (atlasView.js) now
// pass through leg.departureDate straight from the real Atlas day.date
// when the itinerary has per-day dates — but Atlas frequently only has a
// travel-month/day-count window this early (see tripDatesLabel). Route is
// resolved via CITY_IATA (above) for the closed set of major Indian cities
// that genuinely have their own airport; leg.from/leg.to are otherwise
// free-text city/location labels (e.g. "Home" or a primary_location
// string) with no IATA code available, in which case origin_iata/
// destination_iata are simply omitted — sending an unresolved or guessed
// value would violate FlightSearchRequest's 3-letter IATA pattern or
// misrepresent a hill town as having a direct flight. Rather than fabricate
// an IATA code or a date, this function sends only what is genuinely known
// — traveler count (from AtlasTripSummary.num_travelers), departure_date
// when Atlas supplied one, and origin/destination IATA when CITY_IATA
// resolves them — and lets the Backend's own typed clarification_needed
// outcome (FlightSearchClarification) render honestly for whatever's still
// missing. This is the "render the typed clarification_needed state
// honestly" branch the story anticipated,
// not a bug.
async function searchFlightOffer(tripId, leg, travelerCount) {
  const payload = {};
  const originIata = iataForCity(leg.from);
  const destinationIata = iataForCity(leg.to);
  if (originIata) payload.origin_iata = originIata;
  if (destinationIata) payload.destination_iata = destinationIata;
  if (leg.departureDate) payload.departure_date = leg.departureDate;
  if (travelerCount) payload.travelers = { adults: Math.max(1, travelerCount) };
  try {
    const response = await searchFlights(tripId, payload);
    return toLiveOffer(response);
  } catch (error) {
    return { status: 'failed', message: error.message || 'Could not load live flight prices.' };
  }
}

// Flight's option object combines two independently-fetched concerns:
// the CTA (resolveTrustedAction — url/affiliateDisclosure, unchanged from
// TWM-132) and `liveOffer` (searchFlightOffer — price/airline/stops/
// freshness, never a url). Fetched concurrently; a failure in one never
// blocks the other from rendering.
async function resolveFlightOption(tripId, leg, travelerCount) {
  const name = `${modeLabel('flight')}: ${leg.from} → ${leg.to}`;
  const [ctaOption, liveOffer] = await Promise.all([
    resolveTrustedAction(tripId, {
      action_type: ACTION_TYPE_FOR_MODE.flight,
      domain: 'flight',
      origin: leg.from,
      destination: leg.to,
    })
      .then(result => toTransportOption('flight', name, result))
      .catch(error => ({ mode: 'flight', name, status: 'error', errorMessage: error.message || 'Could not load this option.' })),
    searchFlightOffer(tripId, leg, travelerCount),
  ]);
  return { ...ctaOption, liveOffer };
}

// Resolves one mode's trusted action into the shape TransportOptionCard
// consumes. Every backend outcome (resolved / missing_input /
// unsupported_partner / disabled, plus a network-error fallback) maps to a
// `status`, so the card can render each safely instead of assuming
// `resolved` — a hard requirement from TWM-130's status discriminator.
async function resolveTransportOption(tripId, leg, mode, travelerCount) {
  const name = `${modeLabel(mode)}: ${leg.from} → ${leg.to}`;
  if (mode === 'flight') {
    // flight combines the trusted-action CTA with a real live-offer search
    // (TWM-146) — see resolveFlightOption's own comment for why these two
    // network calls are kept as separate concerns on one option object.
    return resolveFlightOption(tripId, leg, travelerCount);
  }
  const domain = DOMAIN_FOR_MODE[mode];
  if (!domain) {
    // drive: feasibility-only, no trusted-action domain exists.
    return { mode, name, status: 'no_action' };
  }
  try {
    const result = await resolveTrustedAction(tripId, {
      action_type: ACTION_TYPE_FOR_MODE[mode],
      domain,
      origin: leg.from,
      destination: leg.to,
    });
    return toTransportOption(mode, name, result);
  } catch (error) {
    return { mode, name, status: 'error', errorMessage: error.message || 'Could not load this option.' };
  }
}

function toTransportOption(mode, name, result) {
  if (result.status === 'resolved') {
    const action = result.action;
    return {
      mode,
      name,
      status: 'resolved',
      url: action.target?.target_url ?? null,
      internalCapability: action.internal_capability ?? null,
      affiliateDisclosure: !!action.affiliate_disclosure,
    };
  }
  return { mode, name, status: result.status };
}

// TWM-195 root fix: resolves trusted-action/flight-search options only for
// `approvedModes` — the Backend-approved, route-valid mode list for this
// leg (TripFeasibilityAssessment.modes). This function must never resolve
// a mode Backend did not return: the old behavior of unconditionally
// resolving MODES=[flight,train,bus,drive] and hiding/filtering afterward
// is exactly the "resolve all hardcoded modes then filter" pattern the
// Linear issue's Root Fix Requirement forbids. `MODES` (above) remains
// exported only as a label/ordering helper — never as the source of which
// modes get resolved here. An empty/missing `approvedModes` resolves
// nothing and returns `[]` immediately, with no network call at all.
export async function transportOptionsFor(tripId, leg, travelerCount, approvedModes) {
  const modes = approvedModes || [];
  if (modes.length === 0) return [];
  return Promise.all(modes.map(mode => resolveTransportOption(tripId, leg, mode, travelerCount)));
}

// Fetches the real per-route TripFeasibilityAssessment for a leg. Callers
// MUST fetch this and read `.modes` BEFORE calling transportOptionsFor —
// never resolve-then-filter (TWM-195 Root Fix Requirement). May resolve to
// null on a request failure, which callers must treat identically to an
// empty `modes: []` response: no bookable modes, never a fallback to "try
// every mode".
export async function fetchLegFeasibility(tripId, leg) {
  return getTripFeasibility(tripId, { origin: leg.from, destination: leg.to });
}

// TWM-195 root-fix simplification: Backend's TripFeasibilityAssessment now
// only ever contains genuinely feasible/route-valid entries (no more
// excluded_modes / per-mode ruled_out / unknown to bucket) — so this no
// longer splits options into feasible/excluded/unassessed. `options` was
// already resolved only for the modes Backend approved (see
// transportOptionsFor above), so this is a straight 1:1 enrichment pass:
// attach each option's matching duration/distance/reason/verification
// metadata from the feasibility entry with the same mode. Traveler-fit
// ranking among the returned modes (recommendedMode, below) is a UI
// concern the Backend deliberately does not perform — it stays separate
// from this route-plausibility enrichment step.
export function feasibleTransportOptions(options, feasibility) {
  const modesByName = new Map((feasibility?.modes || []).map(entry => [entry.mode, entry]));
  return (options || []).map(option => {
    const modeFeasibility = modesByName.get(option.mode);
    if (!modeFeasibility) return option;
    return {
      ...option,
      durationMinutes: modeFeasibility.estimated_duration_minutes,
      distanceKm: modeFeasibility.estimated_distance_km,
      reason: modeFeasibility.reason,
      durationSource: modeFeasibility.duration_source,
      verification: modeFeasibility.verification,
      feasibilityStatus: modeFeasibility.status,
    };
  });
}

// "Recommended mode" selection (TWM-132 — no explicit ranking rule was
// specified in the Linear description beyond "clearly best" or "only one
// feasible"). Judgement call, documented here: fixed priority order
// flight > drive > train > bus among feasible modes — flight and drive are
// Backend-computed (never an LLM estimate) and are generally the fastest
// practical options for a multi-city trip; train/bus are only preferred
// when neither faster mode is feasible. A mode only counts as
// recommendable when it actually has something actionable to show (a
// resolved trusted action, or drive's feasibility-only no_action state —
// never a missing_input/unsupported_partner/disabled/error mode, which has
// no safe CTA to recommend).
const MODE_PRIORITY = ['flight', 'drive', 'train', 'bus'];
export function recommendedMode(feasibleOptions) {
  const actionable = (feasibleOptions || []).filter(option => option.status === 'resolved' || option.status === 'no_action');
  for (const mode of MODE_PRIORITY) {
    const found = actionable.find(option => option.mode === mode);
    if (found) return found;
  }
  return null;
}

// TWM-195 review comment (rewrite): atomic directional transport legs,
// walking Atlas timeline data in day order and tracking a running "current
// location" pointer — replaces the old routeStops-only derivation, which
// deduped consecutive days purely by day.primary_location and had no
// awareness of Atlas TRAVEL timeline items at all. That was the exact
// source of two review-flagged bugs: (1) a compound day.primary_location
// like "Konark & Bhubaneswar" got treated as one destination city and sent
// to feasibility as-is, which isn't a real city and fails closed; (2) every
// leg was bundled into a generic round-trip row (see the now-deleted
// bundleRoundTrip below).
//
// Algorithm (TWM-195 review comment — "prefer Atlas TRAVEL timeline
// movements... rather than treating compound day locations as one
// destination"):
//   1. currentLocation starts at the trip's canonical origin.
//   2. Walk days in order; within each day, walk `timeline` in order. Each
//      `kind: 'TRAVEL'` item's `location` is the destination reached by
//      that atomic movement (Atlas has no explicit from-field on a TRAVEL
//      item — the origin of any movement is implicitly wherever the
//      traveler was immediately before it, i.e. our running pointer). When
//      it differs from currentLocation, emit an atomic leg and advance the
//      pointer; when it equals currentLocation, it's not a real movement,
//      so no same-city pseudo-leg is emitted (per the review comment's
//      explicit "avoid creating a pseudo same-city leg" requirement).
//   3. Gap-filler judgement call: a day-level fallback leg to
//      day.primary_location only fires when that day had ZERO TRAVEL
//      timeline items at all (a genuine Atlas data gap the old
//      routeStops-only logic used to paper over for every day). A day that
//      *does* carry TRAVEL items is trusted completely and never
//      reconciled against day.primary_location — reconciling against it
//      would resurrect exactly the compound-label bug this rewrite fixes
//      (e.g. Day 3's real "Konark" + "Bhubaneswar" TRAVEL items would
//      otherwise get a bogus trailing leg to the compound
//      "Konark & Bhubaneswar" string, since neither atomic destination
//      string-equals that compound label).
//   4. After every day is processed, a final currentLocation -> origin leg
//      is emitted only if the traveler isn't already back at origin — never
//      a pseudo same-city leg for an itinerary that already ends at home.
// departureDate (TWM-146, preserved): best-effort only, taken straight from
// the real Atlas day.date whenever available — never fabricated. Each leg
// uses the date of the day whose timeline (or day-level fallback) produced
// it, i.e. the date the traveler arrives at that leg's destination; the
// final return-to-origin leg uses the last day's date. When Atlas has no
// per-day dates yet, every leg's departureDate is null — the honest
// outcome, not a guess.
export function transportLegs(days, origin) {
  const originLabel = origin || 'Home';
  const legs = [];
  let currentLocation = originLabel;
  let legIndex = 0;
  let lastDayDate = null;

  const pushLeg = (from, to, departureDate) => {
    // Composite id (index + route), not from/to alone — the same city pair
    // can legitimately repeat (e.g. a there-and-back local excursion), so
    // from/to alone wouldn't be a stable/unique key.
    legs.push({ id: `leg-${legIndex++}-${from}->${to}`, from, to, departureDate: departureDate ?? null });
  };

  for (const day of days || []) {
    if (day.date) lastDayDate = day.date;
    let hasTravelItem = false;
    for (const item of day.timeline || []) {
      if (item.kind !== 'TRAVEL' || !item.location) continue;
      hasTravelItem = true;
      if (item.location === currentLocation) continue; // not a real movement
      pushLeg(currentLocation, item.location, day.date);
      currentLocation = item.location;
    }
    // Gap-filler: only when Atlas modeled no TRAVEL movement at all this
    // day — see judgement-call comment above for why a day WITH TRAVEL
    // items is never reconciled against (possibly compound) primary_location.
    if (!hasTravelItem && day.primary_location && currentLocation !== day.primary_location) {
      pushLeg(currentLocation, day.primary_location, day.date);
      currentLocation = day.primary_location;
    }
  }

  if (currentLocation !== originLabel) {
    pushLeg(currentLocation, originLabel, lastDayDate);
  }

  return legs;
}

export function stayLegs(days) {
  return routeStops(days).map(stop => ({ id: `stay-${stop.location}`, location: stop.location, nights: stop.dayNumbers.length }));
}

// Approved stay partners (twm/schemas/trusted_action.py's
// _ALLOWED_PARTNERS_BY_DOMAIN["stay"]), capped to 3 so the Bookings tab
// still shows a tiered comparison rather than every approved partner.
const STAY_PARTNERS = ['hotellook', 'booking_com', 'agoda'];
const PARTNER_LABEL = {
  hotellook: 'Hotellook', booking_com: 'Booking.com', agoda: 'Agoda', hostelworld: 'Hostelworld', ixigo: 'ixigo',
};

async function resolveStayOption(tripId, stay, partner) {
  const name = `${stay.location} — ${PARTNER_LABEL[partner] || partner}`;
  try {
    const result = await resolveTrustedAction(tripId, {
      action_type: 'SEARCH_REDIRECT',
      domain: 'stay',
      destination: stay.location,
      preferred_partner: partner,
    });
    if (result.status === 'resolved') {
      const action = result.action;
      return { name, status: 'resolved', url: action.target?.target_url ?? null, affiliateDisclosure: !!action.affiliate_disclosure };
    }
    return { name, status: result.status };
  } catch (error) {
    return { name, status: 'error', errorMessage: error.message || 'Could not load this option.' };
  }
}

// Async: resolves the approved stay partners in parallel for one stay leg.
// Called from TripDashboard.jsx inside a useEffect, mirroring
// transportOptionsFor.
export async function stayOptionsFor(tripId, stay) {
  return Promise.all(STAY_PARTNERS.map(partner => resolveStayOption(tripId, stay, partner)));
}

// Activity bookings are never mock — only real Atlas-flagged items, the
// exception for that day, not the norm.
export function activityBookings(days) {
  return (days || []).flatMap(day =>
    (day.timeline || [])
      .filter(item => item.kind === 'ACTIVITY' && item.requires_advance_booking)
      .map(item => ({ id: `activity-${day.day_number}-${item.title}`, dayNumber: day.day_number, title: item.title, detail: item.detail }))
  );
}

// Never a bare status word — states exactly what's missing.
export function notBookedYetLabel(name) {
  return `${name} not booked yet`;
}
