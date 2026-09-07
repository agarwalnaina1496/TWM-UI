// Canonical readers for the `booking_setup` TripState branch (TWM-216 —
// twm/schemas/booking_setup.py). Deterministic, Backend-owned scheduling
// the traveler sets to turn a frozen plan into concrete, prefilled provider
// searches: the structured party and per-entity search-date preferences.
// There is no trip-level date control. Never Scout/Meridian/Guide-extracted,
// never in trip_context.
//
// All readers take the whole `tripState` (not `trip_context`) since this is
// a top-level branch alongside stage/trip_context/planner_state.

function branch(tripState) {
  const value = tripState?.booking_setup;
  return value && typeof value === 'object' ? value : null;
}

// The structured adult/child/infant party — the booking-precision counterpart
// to the loose trip_context.num_travelers fact. null until set via the
// party form. Only ever sent in a real booking/search payload.
export function bookingSetupParty(tripState) {
  const party = branch(tripState)?.party;
  if (!party || typeof party !== 'object') return null;
  const { adults, children, infants } = party;
  if (![adults, children, infants].every(Number.isInteger)) return null;
  if (adults < 1 || children < 0 || infants < 0) return null;
  return { adults, children, infants };
}

// One per-entity search-date preference, keyed by the stable Trip Board id
// of a stay segment (`targetType: 'stay'`) or transport item
// (`targetType: 'transport'`). Shape mirrors `start`:
//   { precision: 'exact', date } | { precision: 'month', month }
// null when the traveler has not set a date for that entity (the Board then
// falls back to Atlas's own per-leg date, or none).
export function bookingSetupSearchPref(tripState, targetType, targetId) {
  if (!targetId) return null;
  const bucket = branch(tripState)?.search_prefs?.[`${targetType}s`];
  const entry = bucket && typeof bucket === 'object' ? bucket[targetId] : null;
  if (!entry || typeof entry !== 'object') return null;
  if (entry.precision === 'exact' && typeof entry.date === 'string') {
    return { precision: 'exact', date: entry.date };
  }
  if (entry.precision === 'month' && typeof entry.month === 'string') {
    return { precision: 'month', month: entry.month };
  }
  return null;
}
