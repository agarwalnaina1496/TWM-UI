import { FLIGHT_SEARCH_KEYS, TRUSTED_ACTION_KEYS } from '../constants/tripPayloads.js';
import { resolveTrustedAction, searchFlights } from './tripApi.js';

// TWM-176/TWM-132: booking data built directly against the real Atlas
// schema shape (primary_location, day_number, timeline, kind,
// requires_advance_booking) — deliberately NOT reusing mockAtlasTrip.js's
// structurally different shape (cost_inr, base, number, items).
// Search/ranking/reasoning here (transportLegs/gatewayLegs) are
// permanent, pure route-derivation from Atlas days with no Backend
// dependency. TWM-132 is the transition promised in the old header comment:
// the terminal action (transportOptionsFor/feasibleTransportOptions/
// stayOptionsFor) now calls the real TWM-130/TWM-131 trusted-action and
// feasibility endpoints instead of returning mock MODE_TEMPLATE bands and a
// Google search URL — so every one of these is now async.

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
// action_type=SEARCH_REDIRECT (Aviasales, TWM-196 — replacing the earlier
// ixigo placeholder) for flight's CTA, per the backend
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
//
// TWM-215: traveler_count/group_total_minor_units/group_total_is_approximate
// are now a Backend-computed enrichment present only once the traveler's
// exact composition is known — the provider itself never required a
// traveler count to search at all. group_total_minor_units is therefore
// null just as often as it's set; dividing a null by 100 used to silently
// render "NaN" instead of falling back to the one price point the
// provider always does disclose (per_traveler_amount_minor_units). No
// "approx." prefix on the per-traveler fallback: unlike the group total,
// it's the provider's own literal price, not a Backend-computed multiple.
function flightPriceLabel(money) {
  if (money.group_total_minor_units != null) {
    const amount = (money.group_total_minor_units / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    return `${money.group_total_is_approximate ? 'approx. ' : ''}${money.currency} ${amount}`;
  }
  const perTraveler = (money.per_traveler_amount_minor_units / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${money.currency} ${perTraveler} per traveler`;
}

// TWM-206: maps one NormalizedFlightOffer into the shape
// FlightLiveOfferInfo renders per row — used for every offer now, not just
// a single picked one (see mapOffers below, the origin bug this story's
// discovery started from: a real ranked list was being collapsed to one
// row before it ever reached the card).
function mapOffer(offer) {
  return {
    priceLabel: flightPriceLabel(offer.money),
    airline: offer.airline_name || offer.airline_code || null,
    flightNumber: offer.flight_number ?? null,
    stopCount: offer.stop_count ?? null,
    // No arrival time exists on this contract (twm/schemas/
    // flight_search.py's NormalizedFlightOffer deliberately has no
    // arrival_at field — the current Aviasales Data API generation never
    // discloses one) — only a departure time is ever shown.
    departureAt: offer.departure_at ?? null,
    priceFoundAt: offer.price_found_at,
    offerExpiresAt: offer.offer_expires_at ?? null,
    isRecommended: !!offer.is_recommended,
  };
}

// Maps every Backend-ranked offer (TWM-145's ranking), not just one —
// `primary` (the recommended offer, or the first defensively if none is
// flagged — should not happen per the backend contract, but never crash
// the card on that assumption) still drives the card's top-level fields
// for backward compatibility with existing single-offer consumers, but
// `offers` carries the full list so the UI can render all of them.
function mapOffers(rawOffers) {
  const offers = rawOffers.map(mapOffer);
  const primary = offers.find(offer => offer.isRecommended) || offers[0];
  return { primary, offers };
}

// Maps a FlightSearchResponse (status-discriminated) into the shape
// FlightLiveOfferCard renders — never conflated with AtlasReference
// evidence or a qualified Atlas cost estimate (TWM-144's contract keeps
// these structurally distinct; this mapping preserves that distinction by
// construction, not by convention).
// TWM-196: every branch also carries originResolved/destinationResolved
// (twm/schemas/flight_search.py's ResolvedAirport, when Backend resolved an
// origin_place/destination_place) and datePrecision ("exact"/"month"/
// "flexible", when readiness was satisfied) — present regardless of status
// so the card can show honest airport/precision context ("Flights from BLR
// to BBI, flexible dates") even alongside a clarification_needed or
// unavailable outcome. Both are simply null when Backend didn't populate
// them (e.g. the caller sent an already-resolved origin_iata directly).
function toLiveOffer(response) {
  const status = response.status;
  const originResolved = response.origin_resolved ?? null;
  const destinationResolved = response.destination_resolved ?? null;
  const datePrecision = response.date_precision ?? null;
  if ((status === 'offer' || status === 'partial') && response.offers?.length) {
    const { primary, offers } = mapOffers(response.offers);
    return {
      status,
      priceLabel: primary.priceLabel,
      airline: primary.airline,
      flightNumber: primary.flightNumber,
      stopCount: primary.stopCount,
      departureAt: primary.departureAt,
      priceFoundAt: primary.priceFoundAt,
      offerExpiresAt: primary.offerExpiresAt,
      // TWM-206: the full ranked list, not just the primary/recommended
      // offer — FlightLiveOfferInfo renders every entry now.
      offers,
      originResolved,
      destinationResolved,
      datePrecision,
    };
  }
  if (status === 'clarification_needed') {
    return {
      status,
      message: response.clarification?.message || `We need ${flightMissingFieldsLabel(response.clarification?.missing_fields)} to search live flight prices.`,
      missingFields: response.clarification?.missing_fields || [],
      originResolved,
      destinationResolved,
      datePrecision,
    };
  }
  if (status === 'unavailable') {
    return {
      status,
      message: response.unavailable?.message,
      originResolved,
      destinationResolved,
      datePrecision,
    };
  }
  // expired / failed: render safely, never raw provider/error data.
  return { status, originResolved, destinationResolved, datePrecision };
}

// TWM-196: airport/IATA resolution is Backend data correctness, not UI
// presentation — this function sends the visible leg's structured
// city/place endpoints (leg.from/leg.to, sourced only from Atlas's
// structured TRAVEL.from_city/to_city — see transportLegs) and lets
// Backend's own OurAirports-backed resolver turn them into an IATA code
// (twm.services.airport_resolution). The UI must never guess a city ->
// IATA mapping itself — this replaces the old CITY_IATA lookup entirely.
// Rather than fabricate a date, this still sends only what is genuinely
// known: departure_date when the TRAVEL item's own structured
// `departure_date` is present (leg.departureDate, TWM-200), else
// departure_month when only the structured `departure_month` window is
// present (leg.departureMonth, TWM-200/TWM-196) — the two are mutually
// exclusive on the request, matching FlightSearchRequest's own
// constraint. Never derived from trip-level free text (e.g. a bare
// "October" travel-window label) — that would mean the UI guessing a
// year, which this codebase's "never fabricate" rule forbids; a leg with
// neither field simply sends no date at all and lets Backend's own typed
// clarification_needed
// outcome (FlightSearchClarification) render honestly for whatever's still
// missing. A month-only/no-date search is not a missing_input either
// (TWM-196): Backend returns a flexible/latest-cached result instead of
// blocking, labeled via the response's date_precision.
async function searchFlightOffer(tripId, leg, travelerComposition) {
  const payload = {};
  if (leg.from) payload[FLIGHT_SEARCH_KEYS.ORIGIN_PLACE] = leg.from;
  if (leg.to) payload[FLIGHT_SEARCH_KEYS.DESTINATION_PLACE] = leg.to;
  if (leg.departureDate) payload[FLIGHT_SEARCH_KEYS.DEPARTURE_DATE] = leg.departureDate;
  else if (leg.departureMonth) payload[FLIGHT_SEARCH_KEYS.DEPARTURE_MONTH] = leg.departureMonth;
  if (travelerComposition) payload[FLIGHT_SEARCH_KEYS.TRAVELERS] = travelerComposition;
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
async function resolveFlightOption(tripId, leg, travelerComposition) {
  const name = `${modeLabel('flight')}: ${leg.from} → ${leg.to}`;
  // TWM-195 review comment: trusted-action transport CTA payloads carry
  // traveler_count (twm/schemas/trusted_action.py's
  // TrustedActionRequest.traveler_count) when a normalized count is known —
  // never sent when it can't be determined, matching this file's existing
  // "only include what's genuinely known" pattern (see origin_iata/
  // departure_date above). This is a structurally separate field from
  // searchFlightOffer's own `travelers: { adults: n }` shape below, which
  // is untouched.
  // TWM-196 review comment: the affiliate CTA must carry leg.departureDate
  // when Atlas provided one — Backend no longer requires an exact date to
  // resolve a trusted-action redirect (it's an optional query param, see
  // trusted_action/resolvers.py), but a known date should still be sent so
  // the partner search page is pre-filled rather than deliberately omitted.
  const normalizedCount = travelerComposition
    ? travelerComposition.adults + travelerComposition.children + travelerComposition.infants
    : null;
  const [ctaOption, liveOffer] = await Promise.all([
    resolveTrustedAction(tripId, {
      [TRUSTED_ACTION_KEYS.ACTION_TYPE]: ACTION_TYPE_FOR_MODE.flight,
      [TRUSTED_ACTION_KEYS.DOMAIN]: 'flight',
      [TRUSTED_ACTION_KEYS.ORIGIN]: leg.from,
      [TRUSTED_ACTION_KEYS.DESTINATION]: leg.to,
      ...(leg.departureDate ? { [TRUSTED_ACTION_KEYS.DEPARTURE_DATE]: leg.departureDate } : {}),
      ...(normalizedCount ? { [TRUSTED_ACTION_KEYS.TRAVELER_COUNT]: normalizedCount } : {}),
    })
      .then(result => toTransportOption('flight', name, result))
      .catch(error => ({ mode: 'flight', name, status: 'error', errorMessage: error.message || 'Could not load this option.' })),
    searchFlightOffer(tripId, leg, travelerComposition),
  ]);
  return { ...ctaOption, liveOffer };
}

// Resolves one mode's trusted action into the shape TransportOptionCard
// consumes. Every backend outcome (resolved / missing_input /
// unsupported_partner / disabled, plus a network-error fallback) maps to a
// `status`, so the card can render each safely instead of assuming
// `resolved` — a hard requirement from TWM-130's status discriminator.
async function resolveTransportOption(tripId, leg, mode, travelerComposition) {
  const name = `${modeLabel(mode)}: ${leg.from} → ${leg.to}`;
  if (mode === 'flight') {
    // flight combines the trusted-action CTA with a real live-offer search
    // (TWM-146) — see resolveFlightOption's own comment for why these two
    // network calls are kept as separate concerns on one option object.
    return resolveFlightOption(tripId, leg, travelerComposition);
  }
  const domain = DOMAIN_FOR_MODE[mode];
  if (!domain) {
    // drive: feasibility-only, no trusted-action domain exists.
    return { mode, name, status: 'no_action' };
  }
  // TWM-195 review comment: train/bus CTA payloads also carry traveler_count
  // when known — same rule as resolveFlightOption above, omitted entirely
  // otherwise.
  const normalizedCount = travelerComposition
    ? travelerComposition.adults + travelerComposition.children + travelerComposition.infants
    : null;
  try {
    const result = await resolveTrustedAction(tripId, {
      [TRUSTED_ACTION_KEYS.ACTION_TYPE]: ACTION_TYPE_FOR_MODE[mode],
      [TRUSTED_ACTION_KEYS.DOMAIN]: domain,
      [TRUSTED_ACTION_KEYS.ORIGIN]: leg.from,
      [TRUSTED_ACTION_KEYS.DESTINATION]: leg.to,
      ...(leg.departureDate ? { [TRUSTED_ACTION_KEYS.DEPARTURE_DATE]: leg.departureDate } : {}),
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
      // TWM-196: the actual resolved partner (e.g. "aviasales"), never
      // hardcoded — the CTA label is built from this, not a fixed name,
      // so a future partner change doesn't require a UI copy change here.
      partner: action.target?.partner ?? null,
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
export async function transportOptionsFor(tripId, leg, travelerComposition, approvedModes) {
  const modes = approvedModes || [];
  if (modes.length === 0) return [];
  return Promise.all(modes.map(mode => resolveTransportOption(tripId, leg, mode, travelerComposition)));
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
// `detail`, which may carry road/landmark/"via" narration Atlas is free to
// write for a traveler to read (e.g. "Marine Drive, Puri to Konark").
// Atlas/Backend owns route meaning; this function must not parse that
// narrative text, and must not infer a route on its own — including a
// trip_context.origin_city bookend leg. Atlas's own prompt already
// instructs it to include transport to/from the origin as a TRAVEL item
// when known; if it omits that movement (or any other), the honest outcome
// is a missing leg here, not a UI-synthesized one (TWM-200 review finding).
//
// A TRAVEL item that is missing a structured endpoint pair is dropped
// entirely rather than falling back to narrative text — fail closed for that
// movement (TWM-200 acceptance criteria), not a best-effort parse.
//
// departureDate/departureMonth (TWM-200): read only from the TRAVEL item's
// own structured `departure_date`/`departure_month` fields — never the
// day-level `day.date` (which Atlas may leave as day-offset/free text) and
// never derived from free-text trip timing. Atlas's schema already
// guarantees the two are mutually exclusive and validated (YYYY-MM-DD /
// YYYY-MM); this function just passes through whichever is present, or
// both null when Atlas didn't have confirmed precision for that leg.
//
// TWM-216: the trip-level date fallback (the traveler's calendar anchor and
// per-leg search-date preferences) is resolved server-side by the Trip
// Board now — each transport item arrives with its effective
// departure_date/departure_month plus a date_source. TripDashboard builds
// the transport drawer's `leg` straight from that Board item, so this
// helper only ever needs Atlas's own structured per-item value.
export function transportLegs(days) {
  const movements = (days || []).flatMap(day =>
    (day.timeline || [])
      .filter(item => item.kind === 'TRAVEL' && item.from_city && item.to_city)
      .map(item => ({
        from: item.from_city,
        to: item.to_city,
        departureDate: item.departure_date ?? null,
        departureMonth: item.departure_month ?? null,
      }))
  );
  return movements.map((movement, i) => ({ id: `leg-${i}`, ...movement }));
}

// TWM-195 (MVP scope narrowing): Bookings Transport is gateway-only —
// only the boundary legs that connect the traveler's canonical
// trip_context.origin_city to the itinerary route are ever fed to
// feasibility/resolved/rendered. Every internal/circuit/local movement
// stays visible as itinerary guidance (it's still in `transportLegs`'
// full output for that), but must never become a Bookings row, and must
// never trigger a feasibility/trusted-action/flight-search network call —
// this filter runs BEFORE any of those calls, not as an after-the-fact
// UI hide.
//
// - Outbound gateway: the FIRST leg (in itinerary order) whose `from`
//   equals originCity — "the first structured movement from origin_city
//   into the itinerary route."
// - Inbound gateway: the LAST leg whose `to` equals originCity — "the
//   final structured movement from the itinerary route back to
//   origin_city." Independent of the outbound leg on purpose: an
//   open-jaw trip (fly into one city, out of another) is valid, so this
//   is never assumed to be the same leg reversed.
// - If originCity is unknown (no canonical trip_context.origin_city), or
//   no leg's `from`/`to` matches it, that direction fails closed — no
//   gateway row is fabricated, exactly like `transportLegs` itself never
//   fabricates a bookend from a missing structured endpoint.
// - The two gateway legs may be the same leg (a single direct round-trip
//   leg) or two different legs (open-jaw, or a multi-stop circuit) — both
//   render as their own row regardless; this function only selects which
//   leg objects are visible, it doesn't merge or bundle them.
export function gatewayLegs(legs, originCity) {
  if (!originCity) return [];
  const outbound = (legs || []).find(leg => leg.from === originCity);
  const inbound = [...(legs || [])].reverse().find(leg => leg.to === originCity);
  const gateways = [];
  if (outbound) gateways.push(outbound);
  if (inbound && inbound.id !== outbound?.id) gateways.push(inbound);
  return gateways;
}

// Stay partners are ordered by the confirmed capability matrix from
// TWM-216: Booking.com has the most broadly useful destination search,
// Agoda is shown when Backend has verified destination metadata, and
// ixigo is the browse fallback. The drawer filters out no-capability
// statuses rather than rendering broken or speculative cards.
const STAY_PARTNERS = ['booking_com', 'agoda', 'ixigo'];
// TWM-196: exported so TripDashboard.jsx can build the flight affiliate
// CTA's label from the Backend-returned partner name (option.partner)
// instead of a hardcoded partner name — a future partner change on the
// Backend side never requires a matching hardcoded-string change here.
export const PARTNER_LABEL = {
  aviasales: 'Aviasales', hotellook: 'Hotellook', booking_com: 'Booking.com', agoda: 'Agoda', hostelworld: 'Hostelworld', ixigo: 'ixigo',
};

async function resolveStayOption(tripId, stay, partner, travelerComposition) {
  const name = `${stay.location} — ${PARTNER_LABEL[partner] || partner}`;
  const checkoutDate = stay.checkoutDate || (stay.departureDate && stay.nights
    ? addDaysIso(stay.departureDate, stay.nights)
    : null);
  try {
    const result = await resolveTrustedAction(tripId, {
      [TRUSTED_ACTION_KEYS.ACTION_TYPE]: 'SEARCH_REDIRECT',
      [TRUSTED_ACTION_KEYS.DOMAIN]: 'stay',
      [TRUSTED_ACTION_KEYS.DESTINATION]: stay.location,
      [TRUSTED_ACTION_KEYS.PREFERRED_PARTNER]: partner,
      ...(stay.departureDate ? { [TRUSTED_ACTION_KEYS.DEPARTURE_DATE]: stay.departureDate } : {}),
      ...(checkoutDate ? {
        [TRUSTED_ACTION_KEYS.RETURN_DATE]: checkoutDate,
        [TRUSTED_ACTION_KEYS.TRIP_SHAPE]: 'round_trip',
      } : {}),
      ...(travelerComposition ? {
        [TRUSTED_ACTION_KEYS.TRAVELER_COUNT]: travelerComposition.adults
          + travelerComposition.children
          + travelerComposition.infants,
      } : {}),
    });
    if (result.status === 'resolved') {
      const action = result.action;
      return {
        name,
        partner: action.target?.partner ?? partner,
        status: 'resolved',
        url: action.target?.target_url ?? null,
        affiliateDisclosure: !!action.affiliate_disclosure,
        capability: action.capability ?? null,
        ctaLabel: action.cta_label ?? 'Search stays',
        capabilityNote: action.capability_note ?? null,
      };
    }
    return { name, status: result.status };
  } catch (error) {
    return { name, status: 'error', errorMessage: error.message || 'Could not load this option.' };
  }
}

function addDaysIso(isoDate, dayCount) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + dayCount);
  return parsed.toISOString().slice(0, 10);
}

// Async: resolves confirmed stay provider capabilities in parallel. Hidden
// providers are only those with no resolved URL/capability from Backend.
export async function stayOptionsFor(tripId, stay, travelerComposition) {
  const options = await Promise.all(STAY_PARTNERS.map(partner => resolveStayOption(tripId, stay, partner, travelerComposition)));
  return options.filter(option => option.status === 'resolved' && option.url);
}

