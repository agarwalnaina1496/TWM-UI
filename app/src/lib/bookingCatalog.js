import { routeStops } from './atlasView.js';
import { resolveTrustedAction, getTripFeasibility, searchFlights } from './tripApi.js';

// TWM-176/TWM-132: booking data built directly against the real Atlas
// schema shape (primary_location, day_number, timeline, kind,
// requires_advance_booking) — deliberately NOT reusing mockAtlasTrip.js's
// structurally different shape (cost_inr, base, number, items).
// Search/ranking/reasoning here (transportLegs/bundleRoundTrip/stayLegs) are
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

// Async: resolves every mode's trusted action for one leg in parallel.
// Called from TripDashboard.jsx inside a useEffect (not synchronously
// during render — see the page's Bookings-tab loading/error state).
export async function transportOptionsFor(tripId, leg, travelerCount) {
  return Promise.all(MODES.map(mode => resolveTransportOption(tripId, leg, mode, travelerCount)));
}

// Fetches the real per-route TripFeasibilityAssessment (flight/train/bus/
// drive) for a leg. May resolve to null — the Backend has no assessment for
// this route yet — which callers must treat as "no feasibility data", not
// an error.
export async function fetchLegFeasibility(tripId, leg) {
  return getTripFeasibility(tripId, { origin: leg.from, destination: leg.to });
}

// Merges the real TripFeasibilityAssessment onto each mode's resolved
// option — duration/distance/reason now come straight from the Backend
// (already computed there), never re-synthesized client-side. A mode with
// status: ruled_out is genuinely excluded (in `excluded`, for the
// explanatory note), never rendered faded. When no assessment exists yet,
// every option is treated as feasible with no duration/reason attached.
export function feasibleTransportOptions(options, feasibility) {
  const modesByName = new Map((feasibility?.modes || []).map(entry => [entry.mode, entry]));
  const feasible = [];
  const excluded = [];
  for (const option of options) {
    const modeFeasibility = modesByName.get(option.mode);
    const enriched = modeFeasibility
      ? {
        ...option,
        durationMinutes: modeFeasibility.estimated_duration_minutes,
        distanceKm: modeFeasibility.estimated_distance_km,
        reason: modeFeasibility.reason,
        durationSource: modeFeasibility.duration_source,
        verification: modeFeasibility.verification,
        feasibilityStatus: modeFeasibility.status,
      }
      : option;
    if (modeFeasibility?.status === 'ruled_out') {
      excluded.push(enriched);
    } else {
      feasible.push(enriched);
    }
  }
  return { feasible, excluded };
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

// Transport legs: consecutive primary_location changes across days, PLUS
// the origin<->destination bookend legs — the old Logistics page showed
// only local transfers between stops and dropped the actual origin leg
// entirely.
// departureDate (TWM-146): best-effort only, derived straight from
// stops[i].dates (routeStops's additive Atlas day.date passthrough) — never
// fabricated. The outbound-origin leg uses the first stop's first date (the
// traveler needs to be there by then); an inner leg uses its destination
// stop's first date (when the traveler arrives there); the return-origin
// leg uses the last stop's last date (departing after the final stop).
// When Atlas has no per-day dates yet (tripDatesLabel's "Travel month"/
// day-count fallback case), every leg's departureDate is null — the honest
// outcome, not a guess.
export function transportLegs(days, origin) {
  const stops = routeStops(days);
  if (stops.length === 0) return [];
  const originLabel = origin || 'Home';
  const legs = [{ id: 'outbound-origin', from: originLabel, to: stops[0].location, departureDate: stops[0].dates?.[0] ?? null }];
  for (let i = 0; i < stops.length - 1; i++) {
    legs.push({ id: `leg-${i}`, from: stops[i].location, to: stops[i + 1].location, departureDate: stops[i + 1].dates?.[0] ?? null });
  }
  const lastStop = stops[stops.length - 1];
  legs.push({ id: 'return-origin', from: lastStop.location, to: originLabel, departureDate: lastStop.dates?.[lastStop.dates.length - 1] ?? null });
  return legs;
}

// A round trip bundles as one priced decision, not two separate one-way
// resolves — true whenever the traveler ends up back where they started
// (the first leg's origin equals the last leg's destination), regardless
// of how many different cities sit in between on a multi-stop circuit.
export function bundleRoundTrip(legs) {
  if (legs.length < 2) return { bundle: null, rest: legs };
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first.from === last.to) {
    return { bundle: { id: 'round-trip', outbound: first, inbound: last }, rest: legs.slice(1, -1) };
  }
  return { bundle: null, rest: legs };
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
