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
});

export function tripOriginCity(tripContext) {
  return tripContext?.[TRIP_CONTEXT_KEYS.ORIGIN_CITY] ?? null;
}

// trip_context.num_travelers is stored verbatim (a range, "just me", "4"),
// same loose-conversational-fact role as travel_dates — this is the one
// place that normalizes it down to a plain number for the context-facts
// display. Never used for a real booking payload; see
// bookingSetupParty (constants/bookingSetup.js) for the structured,
// booking-precision counterpart.
export function tripTravelerCount(tripContext) {
  const raw = tripContext?.[TRIP_CONTEXT_KEYS.NUM_TRAVELERS];
  if (raw === undefined || raw === null || raw === '') return null;
  const count = Number(raw);
  return Number.isFinite(count) ? count : null;
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
// use this only to default which precision the trip-start form starts on,
// never to fabricate a value.
export function tripTravelDatesMonthName(tripContext) {
  const raw = tripContext?.[TRIP_CONTEXT_KEYS.TRAVEL_DATES];
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase();
  const match = MONTH_NAMES.find(month => lower.includes(month));
  return match ? match[0].toUpperCase() + match.slice(1) : null;
}
