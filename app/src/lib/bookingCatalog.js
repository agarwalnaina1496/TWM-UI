import { FLIGHT_SEARCH_KEYS, TRUSTED_ACTION_KEYS } from '../constants/tripPayloads.js';
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

// TWM-195 review comment: trip_context.num_travelers can arrive as a
// chat-entered string (e.g. '2', 'Just me' — see entryCommandFixtures.js's
// own quick-reply chips), not a number. Normalizes to a positive integer or
// null — never NaN, never 0/negative — so callers can safely omit the
// field entirely rather than send a garbage value.
export function normalizeTravelerCount(value) {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  if (originIata) payload[FLIGHT_SEARCH_KEYS.ORIGIN_IATA] = originIata;
  if (destinationIata) payload[FLIGHT_SEARCH_KEYS.DESTINATION_IATA] = destinationIata;
  if (leg.departureDate) payload[FLIGHT_SEARCH_KEYS.DEPARTURE_DATE] = leg.departureDate;
  if (travelerCount) payload[FLIGHT_SEARCH_KEYS.TRAVELERS] = { adults: Math.max(1, travelerCount) };
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
  // TWM-195 review comment: trusted-action transport CTA payloads carry
  // traveler_count (twm/schemas/trusted_action.py's
  // TrustedActionRequest.traveler_count) when a normalized count is known —
  // never sent when it can't be determined, matching this file's existing
  // "only include what's genuinely known" pattern (see origin_iata/
  // departure_date above). This is a structurally separate field from
  // searchFlightOffer's own `travelers: { adults: n }` shape below, which
  // is untouched.
  const normalizedCount = normalizeTravelerCount(travelerCount);
  const [ctaOption, liveOffer] = await Promise.all([
    resolveTrustedAction(tripId, {
      [TRUSTED_ACTION_KEYS.ACTION_TYPE]: ACTION_TYPE_FOR_MODE.flight,
      [TRUSTED_ACTION_KEYS.DOMAIN]: 'flight',
      [TRUSTED_ACTION_KEYS.ORIGIN]: leg.from,
      [TRUSTED_ACTION_KEYS.DESTINATION]: leg.to,
      ...(normalizedCount ? { [TRUSTED_ACTION_KEYS.TRAVELER_COUNT]: normalizedCount } : {}),
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
  // TWM-195 review comment: train/bus CTA payloads also carry traveler_count
  // when known — same rule as resolveFlightOption above, omitted entirely
  // otherwise.
  const normalizedCount = normalizeTravelerCount(travelerCount);
  try {
    const result = await resolveTrustedAction(tripId, {
      [TRUSTED_ACTION_KEYS.ACTION_TYPE]: ACTION_TYPE_FOR_MODE[mode],
      [TRUSTED_ACTION_KEYS.DOMAIN]: domain,
      [TRUSTED_ACTION_KEYS.ORIGIN]: leg.from,
      [TRUSTED_ACTION_KEYS.DESTINATION]: leg.to,
      ...(normalizedCount ? { [TRUSTED_ACTION_KEYS.TRAVELER_COUNT]: normalizedCount } : {}),
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
// Trip Feasibility is its own contract, independent of Trusted Action —
// same field names on this occasion, but not the same payload, so this
// intentionally builds a plain object rather than importing TRUSTED_ACTION_KEYS.
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

// Transport legs (TWM-200): built only from each TRAVEL timeline item's
// structured, canonical `from_city`/`to_city` — never from `location` or
// `display_label`, which may carry road/landmark/"via" narration Atlas is
// free to write for a traveler to read (e.g. "Marine Drive, Puri to
// Konark"). Atlas/Backend owns route meaning; this function must not parse
// that narrative text, and must not infer a route on its own — including a
// trip_context.origin_city bookend leg. Atlas's own prompt already
// instructs it to include transport to/from the origin as a TRAVEL item
// when known; if it omits that movement (or any other), the honest outcome
// is a missing leg here, not a UI-synthesized one (TWM-200 review finding).
//
// A TRAVEL item that is missing a structured endpoint pair is dropped
// entirely rather than falling back to display text — fail closed for that
// movement (TWM-200 acceptance criteria), not a best-effort parse.
//
// departureDate: best-effort only, taken from the movement's own day.date
// when Atlas supplied one; never fabricated.
export function transportLegs(days) {
  const movements = (days || []).flatMap(day =>
    (day.timeline || [])
      .filter(item => item.kind === 'TRAVEL' && item.from_city && item.to_city)
      .map(item => ({ from: item.from_city, to: item.to_city, departureDate: day.date ?? null }))
  );
  const legs = movements.map((movement, i) => ({ id: `leg-${i}`, ...movement }));
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
      [TRUSTED_ACTION_KEYS.ACTION_TYPE]: 'SEARCH_REDIRECT',
      [TRUSTED_ACTION_KEYS.DOMAIN]: 'stay',
      [TRUSTED_ACTION_KEYS.DESTINATION]: stay.location,
      [TRUSTED_ACTION_KEYS.PREFERRED_PARTNER]: partner,
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
// TWM-195 review comment (blocker): NOT currently called from
// TripDashboard.jsx — stay/hotel affiliate resolution is out of scope for
// this first mode-visibility slice, and Backend's trusted-action readiness
// currently requires route/date/traveler fields a stay leg doesn't
// genuinely have, so calling this eagerly produced noisy missing_input
// responses. Left intact (not deleted) for the future hotel/stay affiliate
// story to wire back in.
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
