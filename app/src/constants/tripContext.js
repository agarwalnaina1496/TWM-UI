// Canonical TripState `trip_context` keys — the single source of truth for
// this internal contract's field names (twm/schemas/trip_context.py's
// FIXED_KEYS + DESTINATIONS_KEY on the Backend side). Any code addressing
// one of these fields by name should import from here instead of
// re-hardcoding the literal.
export const TRIP_CONTEXT_KEYS = Object.freeze({
  ORIGIN_CITY: 'origin_city',
  NUM_TRAVELERS: 'num_travelers',
  TRIP_DURATION: 'trip_duration',
  TRAVEL_DATES: 'travel_dates',
  BUDGET: 'budget',
  DESTINATIONS: 'destinations',
  BOOKING_DATES: 'booking_dates',
});

export function tripOriginCity(tripContext) {
  return tripContext?.[TRIP_CONTEXT_KEYS.ORIGIN_CITY] ?? null;
}

// trip_context.num_travelers is stored verbatim (a range, "just me", "4"),
// per trip_context.py's untyped-values philosophy — this is the one place
// that normalizes it down to a plain number for callers that need to do
// arithmetic or build a numeric API payload field with it.
export function tripTravelerCount(tripContext) {
  const raw = tripContext?.[TRIP_CONTEXT_KEYS.NUM_TRAVELERS];
  if (raw === undefined || raw === null || raw === '') return null;
  const count = Number(raw);
  return Number.isFinite(count) ? count : null;
}

// TWM-201: the post-freeze booking-date precision the traveler confirmed via
// the Bookings date-update flow — Backend-owned (written only by the
// update_booking_dates trip command), never UI-synthesized. Shape:
// { precision: 'exact', departure_date: 'YYYY-MM-DD' } or
// { precision: 'month', departure_month: 'YYYY-MM' }. null when the
// traveler has never set one.
export function tripBookingDateContext(tripContext) {
  const value = tripContext?.[TRIP_CONTEXT_KEYS.BOOKING_DATES];
  return value && typeof value === 'object' ? value : null;
}
