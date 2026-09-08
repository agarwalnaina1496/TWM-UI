import { TRIP_CONTEXT_KEYS } from '../constants/tripContext.js';
import { contextDestination, contextRecapPills, hasContext } from './tripLifecycle.js';

// TWM-174: Guide gates on a fixed 5-field checklist before it can build a
// plan — trip_duration, origin_city, num_travelers, travel_dates, budget —
// then a sixth open "anything else?" question. `awaiting` names the exact
// trip_context key when Guide is asking for one of them; anything else
// (null, or "anything_else") is not this specific gap. Kept as a UI
// constant: it compares `awaiting` strings, not `trip_context` values.
export const FIXED_FIELDS = [
  TRIP_CONTEXT_KEYS.TRIP_DURATION,
  TRIP_CONTEXT_KEYS.ORIGIN_CITY,
  TRIP_CONTEXT_KEYS.NUM_TRAVELERS,
  TRIP_CONTEXT_KEYS.TRAVEL_DATES,
  TRIP_CONTEXT_KEYS.BUDGET,
];

export function isFixedFieldGap(awaiting) {
  return FIXED_FIELDS.includes(awaiting);
}

// TWM-174/TWM-220: Plan chat's refresh-recap, mirroring Discover's pattern
// but phrased for Guide's planning context. Presentation-only — built fresh
// from the composed `TripView` (context_recap + plan.awaiting).
export function buildPlanRecapTurn(view, { awaiting } = {}) {
  if (!hasContext(view)) return null;
  const destinationText = contextDestination(view) || 'your trip';
  const pills = contextRecapPills(view);
  let text = `Picking up where you left off — planning ${destinationText}`;
  text += pills.length > 0 ? ` (${pills.join(', ')}).` : '.';
  if (awaiting && awaiting !== 'anything_else') text += ` I still need to know about ${String(awaiting).replace(/_/g, ' ')} — want to pick that up?`;
  return text;
}
