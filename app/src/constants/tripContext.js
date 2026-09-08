// Canonical TripState `trip_context` key names — the single source of truth
// for this internal contract's field names (twm/schemas/trip_context.py's
// FIXED_KEYS + DESTINATIONS_KEY on the Backend side).
//
// TWM-220: the raw-value readers (tripOriginCity / tripTravelerCount /
// travelerCompositionTotal) are gone — every recap / summary / party fact
// is composed server-side into `TripView` now. Only the key names survive,
// still needed by planChat's `FIXED_FIELDS` (which compares `awaiting`
// strings, not trip_context values).
export const TRIP_CONTEXT_KEYS = Object.freeze({
  ORIGIN_CITY: 'origin_city',
  NUM_TRAVELERS: 'num_travelers',
  TRIP_DURATION: 'trip_duration',
  TRAVEL_DATES: 'travel_dates',
  BUDGET: 'budget',
  DESTINATIONS: 'destinations',
});
