import { FLIGHT_SEARCH_KEYS } from '../constants/tripPayloads.js';
import { resolveBookingOptions, searchFlights } from './tripApi.js';

// TWM-176/TWM-132/TWM-220: transport/stay option resolution. `transportLegs`
// / `gatewayLegs` stay as pure route-derivation helpers. The terminal
// resolution now goes through ONE batch call —
// POST /trips/{id}/booking-options (resolveBookingOptions) — instead of a
// per-mode / per-partner `Promise.all`. Flight additionally gets a live
// cached-price search (searchFlightOffer / POST /flight-search), which is a
// separate concern the batch never carries.

export const MODES = ['flight', 'train', 'bus', 'drive'];
const MODE_LABEL = { flight: 'Flight', train: 'Train', bus: 'Bus', drive: 'Drive' };
export function modeLabel(mode) {
  return MODE_LABEL[mode] || mode;
}

// drive has no trusted-action domain — its feasibility is purely computed
// distance/routing, never a partner handoff. It is never a batch target.
const BATCHABLE_MODES = new Set(['flight', 'train', 'bus']);

const STAY_PARTNERS = ['booking_com', 'agoda', 'ixigo'];

export const PARTNER_LABEL = {
  aviasales: 'Aviasales', hotellook: 'Hotellook', booking_com: 'Booking.com', agoda: 'Agoda', hostelworld: 'Hostelworld', ixigo: 'ixigo',
};

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

function mapOffer(offer) {
  return {
    priceLabel: flightPriceLabel(offer.money),
    airline: offer.airline_name || offer.airline_code || null,
    flightNumber: offer.flight_number ?? null,
    stopCount: offer.stop_count ?? null,
    departureAt: offer.departure_at ?? null,
    priceFoundAt: offer.price_found_at,
    offerExpiresAt: offer.offer_expires_at ?? null,
    isRecommended: !!offer.is_recommended,
  };
}

function mapOffers(rawOffers) {
  const offers = rawOffers.map(mapOffer);
  const primary = offers.find(offer => offer.isRecommended) || offers[0];
  return { primary, offers };
}

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
    return { status, message: response.unavailable?.message, originResolved, destinationResolved, datePrecision };
  }
  return { status, originResolved, destinationResolved, datePrecision };
}

async function searchFlightOffer(tripId, leg, party) {
  const payload = {};
  if (leg.from) payload[FLIGHT_SEARCH_KEYS.ORIGIN_PLACE] = leg.from;
  if (leg.to) payload[FLIGHT_SEARCH_KEYS.DESTINATION_PLACE] = leg.to;
  if (leg.departureDate) payload[FLIGHT_SEARCH_KEYS.DEPARTURE_DATE] = leg.departureDate;
  else if (leg.departureMonth) payload[FLIGHT_SEARCH_KEYS.DEPARTURE_MONTH] = leg.departureMonth;
  if (party) payload[FLIGHT_SEARCH_KEYS.TRAVELERS] = party;
  try {
    const response = await searchFlights(tripId, payload);
    return toLiveOffer(response);
  } catch (error) {
    return { status: 'failed', message: error.message || 'Could not load live flight prices.' };
  }
}

// One batch result entry -> the transport option shape TransportOptionCard
// renders. Every Backend outcome (resolved / missing_input /
// unsupported_partner / disabled, plus a client-side error fallback) maps
// to a `status` the card branches on.
function toTransportOption(mode, name, entry) {
  if (entry.status === 'resolved') {
    const action = entry.action;
    return {
      mode,
      name,
      status: 'resolved',
      url: action.target?.target_url ?? null,
      partner: action.target?.partner ?? null,
      internalCapability: action.internal_capability ?? null,
      affiliateDisclosure: !!action.affiliate_disclosure,
    };
  }
  return { mode, name, status: entry.status };
}

function toStayOption(location, partner, entry) {
  const name = `${location} — ${PARTNER_LABEL[partner] || partner}`;
  if (entry.status === 'resolved') {
    const action = entry.action;
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
  return { name, status: entry.status };
}

function partyEnvelope(party) {
  if (!party) return { adults: 1, children: 0, infants: 0 };
  return {
    adults: Math.max(1, party.adults ?? 1),
    children: Math.max(0, party.children ?? 0),
    infants: Math.max(0, party.infants ?? 0),
  };
}

function addDaysIso(isoDate, dayCount) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + dayCount);
  return parsed.toISOString().slice(0, 10);
}

// TWM-220: resolves a gateway leg's transport options in ONE
// booking-options request for the Backend-approved modes, then folds in
// flight's separate live-offer search. drive (feasibility-only) gets an
// inert `no_action` card if it was approved. An empty `approvedModes`
// resolves nothing and returns `[]` with no network call.
export async function transportOptionsFor(tripId, leg, party, approvedModes) {
  const modes = approvedModes || [];
  const batchModes = modes.filter(mode => BATCHABLE_MODES.has(mode));
  const options = [];

  if (batchModes.length > 0) {
    const batch = await resolveBookingOptions(tripId, {
      domain: 'transport',
      from_city: leg.from,
      to_city: leg.to,
      ...(leg.departureDate ? { departure_date: leg.departureDate } : {}),
      party: partyEnvelope(party),
      targets: batchModes.map(mode => ({ kind: 'mode', value: mode })),
    });
    const byMode = new Map((batch.results || []).map(entry => [entry.target.value, entry]));
    for (const mode of batchModes) {
      const name = `${modeLabel(mode)}: ${leg.from} → ${leg.to}`;
      const entry = byMode.get(mode);
      options.push(entry
        ? toTransportOption(mode, name, entry)
        : { mode, name, status: 'error', errorMessage: 'Could not load this option.' });
    }
  }

  const flightOption = options.find(option => option.mode === 'flight');
  if (flightOption) flightOption.liveOffer = await searchFlightOffer(tripId, leg, party);

  if (modes.includes('drive')) {
    options.push({ mode: 'drive', name: `${modeLabel('drive')}: ${leg.from} → ${leg.to}`, status: 'no_action' });
  }
  return options;
}

// TWM-195 root-fix simplification: `options` were resolved only for the
// modes Backend approved, so this is a straight 1:1 enrichment pass —
// attach each option's matching duration/distance/reason/verification from
// the feasibility entry with the same mode.
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

// "Recommended mode" — fixed priority flight > drive > train > bus among
// modes that actually have something actionable (a resolved trusted action,
// or drive's feasibility-only no_action state).
const MODE_PRIORITY = ['flight', 'drive', 'train', 'bus'];
export function recommendedMode(feasibleOptions) {
  const actionable = (feasibleOptions || []).filter(option => option.status === 'resolved' || option.status === 'no_action');
  for (const mode of MODE_PRIORITY) {
    const found = actionable.find(option => option.mode === mode);
    if (found) return found;
  }
  return null;
}

// TWM-220: resolves a stay segment's provider options in ONE booking-options
// request. Hidden providers are only those with no resolved URL/capability
// from Backend.
export async function stayOptionsFor(tripId, stay, party) {
  const checkoutDate = stay.checkoutDate || (stay.departureDate && stay.nights
    ? addDaysIso(stay.departureDate, stay.nights)
    : null);
  const batch = await resolveBookingOptions(tripId, {
    domain: 'stay',
    destination: stay.location,
    ...(stay.departureDate ? { departure_date: stay.departureDate } : {}),
    ...(checkoutDate ? { return_date: checkoutDate, trip_shape: 'round_trip' } : {}),
    party: partyEnvelope(party),
    targets: STAY_PARTNERS.map(partner => ({ kind: 'partner', value: partner })),
  });
  return (batch.results || [])
    .map(entry => toStayOption(stay.location, entry.target.value, entry))
    .filter(option => option.status === 'resolved' && option.url);
}
