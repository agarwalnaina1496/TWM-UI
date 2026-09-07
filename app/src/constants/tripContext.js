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

