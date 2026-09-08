import { FLIGHT_SEARCH_KEYS } from '../../constants/tripPayloads.js';
import { searchFlights } from '../tripApi.js';

// TWM-146/TWM-221: flight's live cached-price search — a separate concern
// the booking-options batch never carries. Maps a status-discriminated
// FlightSearchResponse into the shape FlightLiveOfferInfo renders.

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

export function toLiveOffer(response) {
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

export async function searchFlightOffer(tripId, leg, party) {
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
