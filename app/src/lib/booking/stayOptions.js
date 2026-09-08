import { resolveBookingOptions } from '../tripApi.js';
import { addDaysIso, partyEnvelope, toStayOption } from './shared.js';

// TWM-220/TWM-221: stay-segment provider resolution — one booking-options
// request for every approved partner. Hidden providers are only those with
// no resolved URL / capability from Backend.

const STAY_PARTNERS = ['booking_com', 'agoda', 'ixigo'];

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
