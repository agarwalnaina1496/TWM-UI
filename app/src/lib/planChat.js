import { contextRecapPills, hasTripContext } from './tripLifecycle.js';

// TWM-174: Guide gates on a fixed 5-field checklist before it can build a
// plan — trip_duration, origin_city, num_travelers, travel_dates, budget —
// then a sixth open "anything else?" question. Meridian gates on judgment
// instead, so a Discover→Plan trip can arrive at Guide missing one of these
// five even though Meridian never needed it. `awaiting` names the exact
// trip_context key when Guide is asking for one of them (see
// twm/prompts/guide.md) — anything else (null, or "anything_else") is not
// this specific gap.
export const FIXED_FIELDS = ['trip_duration', 'origin_city', 'num_travelers', 'travel_dates', 'budget'];

export function isFixedFieldGap(awaiting) {
  return FIXED_FIELDS.includes(awaiting);
}

// TWM-174: Plan chat's refresh-recap, mirroring Discover's pattern
// (buildRecapTurn in discoverChat.js) but phrased for Guide's planning
// context rather than Scout's intake. Presentation-only — no transcript is
// persisted, this is built fresh from whatever trip_context/awaiting is
// already saved.
export function buildPlanRecapTurn(tripContext, { awaiting } = {}) {
  if (!hasTripContext({ trip_context: tripContext })) return null;
  const destinations = tripContext?.destinations;
  const destinationText = Array.isArray(destinations) && destinations.length > 0
    ? destinations.join(', ')
    : 'your trip';
  const pills = contextRecapPills(tripContext);
  let text = `Picking up where you left off — planning ${destinationText}`;
  text += pills.length > 0 ? ` (${pills.join(', ')}).` : '.';
  if (awaiting && awaiting !== 'anything_else') text += ` I still need to know about ${String(awaiting).replace(/_/g, ' ')} — want to pick that up?`;
  return text;
}
