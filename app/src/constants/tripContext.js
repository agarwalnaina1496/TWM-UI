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
  TRAVELER_COMPOSITION: 'traveler_composition',
});

export function tripOriginCity(tripContext) {
  return tripContext?.[TRIP_CONTEXT_KEYS.ORIGIN_CITY] ?? null;
}

// trip_context.num_travelers is stored verbatim (a range, "just me", "4"),
// same loose-conversational-fact role as travel_dates — this is the one
// place that normalizes it down to a plain number for the context-facts
// display. Never used for a real booking payload; see
// tripTravelerComposition below for that.
export function tripTravelerCount(tripContext) {
  const raw = tripContext?.[TRIP_CONTEXT_KEYS.NUM_TRAVELERS];
  if (raw === undefined || raw === null || raw === '') return null;
  const count = Number(raw);
  return Number.isFinite(count) ? count : null;
}

// TWM-213: the Backend-owned, structured adult/child/infant composition —
// written only by the update_traveler_composition trip command, never
// Scout/Meridian/Guide-extracted. Same "structured, booking-precision
// counterpart to a loose conversational fact" role as
// tripBookingDateContext below. null until the traveler has explicitly set
// it via the Set-travelers flow.
export function tripTravelerComposition(tripContext) {
  const value = tripContext?.[TRIP_CONTEXT_KEYS.TRAVELER_COMPOSITION];
  if (!value || typeof value !== 'object') return null;
  const { adults, children, infants } = value;
  if (![adults, children, infants].every(Number.isInteger)) return null;
  if (adults < 1 || children < 0 || infants < 0) return null;
  return { adults, children, infants };
}

export function travelerCompositionTotal(composition) {
  if (!composition) return null;
  return composition.adults + composition.children + composition.infants;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// TWM-215 live-testing finding: trip_context.travel_dates is the raw fact
// the traveler actually stated (verbatim, reaches Atlas unmodified) --
// distinct from trip_summary.date_range, which is Atlas's own narrative
// echo of it tied to one past itinerary-generation run. A loose month name
// here (e.g. "December", with no confirmed year -- Atlas's own dates
// assumption already says so explicitly) is a genuinely known fact even
// though it can't seed a real YYYY-MM value for a month <input>; callers
// use this only to default which precision a booking-date form starts on,
// never to fabricate a value.
export function tripTravelDatesMonthName(tripContext) {
  const raw = tripContext?.[TRIP_CONTEXT_KEYS.TRAVEL_DATES];
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase();
  const match = MONTH_NAMES.find(month => lower.includes(month));
  return match ? match[0].toUpperCase() + match.slice(1) : null;
}

// TWM-201: the post-freeze booking-date precision the traveler confirmed via
// the Bookings date-update flow — Backend-owned (written only by the
// update_booking_dates trip command), never UI-synthesized. Shape:
// { precision: 'exact', departure_date: 'YYYY-MM-DD', return_date?: 'YYYY-MM-DD' } or
// { precision: 'month', departure_month: 'YYYY-MM' }. return_date is
// optional and only ever present alongside departure_date. null when the
// traveler has never set one.
export function tripBookingDateContext(tripContext) {
  const value = tripContext?.[TRIP_CONTEXT_KEYS.BOOKING_DATES];
  return value && typeof value === 'object' ? value : null;
}
