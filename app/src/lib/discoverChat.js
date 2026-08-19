import { contextRecapPills, hasTripContext } from './tripLifecycle.js';

// TWM-173: shared helpers for the Discover entry chat (JourneyEntry's
// discover branch, and ScoutChat's resume path) — both need the same
// refresh-recap and hand-off-note logic, so it lives here once rather than
// being duplicated per screen.

function humanize(field) {
  return String(field).replace(/_/g, ' ');
}

// A refresh must not show Scout's cold-open greeting again once real
// trip_context already exists — that reads as the product forgetting
// everything the traveler already said, even though the facts survived.
// Returns null when there's nothing to recap yet, so the caller falls back
// to the normal greeting.
//
// TWM-183: prefers the real last exchange — matcher_state.conversation_
// context.last_meridian_message is exactly what Meridian actually said last
// turn (already phrased as a genuine follow-up, including whatever it's
// still waiting on), so returning it verbatim beats synthesizing a generic
// "Picking up where you left off" sentence from a fixed field whitelist.
// Only falls back to that synthesized recap for older/known-destination
// trips that never had a real last message saved.
export function buildRecapTurn(tripState, { awaiting } = {}) {
  if (!hasTripContext(tripState)) return null;
  const lastMessage = tripState?.matcher_state?.conversation_context?.last_meridian_message;
  if (typeof lastMessage === 'string' && lastMessage.trim()) return lastMessage;
  const pills = contextRecapPills(tripState?.trip_context);
  let text = 'Picking up where you left off';
  text += pills.length > 0 ? ` — ${pills.join(', ')}.` : '.';
  if (awaiting) text += ` I still need to know about ${humanize(awaiting)} — want to pick that up?`;
  return text;
}

// Known-fields-only facts panel — no null/pending placeholder rows, matching
// trip_context's free-form philosophy (a field simply isn't shown until
// it's actually known, never rendered empty).
const FACT_LABELS = [
  ['origin', 'From'],
  ['budget', 'Budget'],
  ['duration_days', 'Duration'],
  ['travelers', 'Travelers'],
  ['travel_window', 'When'],
  ['month', 'Month'],
  ['dates', 'Dates'],
];

export function buildFactsPanel(tripContext) {
  return FACT_LABELS
    .map(([key, label]) => {
      const value = tripContext?.[key];
      if (value === undefined || value === null || value === '') return null;
      const display = key === 'duration_days' ? `${value} day${value === 1 ? '' : 's'}`
        : key === 'travelers' ? `${value} traveler${value === 1 ? '' : 's'}`
        : String(value);
      return { key, label, value: display };
    })
    .filter(Boolean);
}

// A hand-off note fires exactly once, only on the actual scout->meridian
// transition — not on every render where meridian already owns the trip.
export function didHandoffOccur(previousAgent, nextAgent) {
  return previousAgent === 'scout' && nextAgent === 'meridian';
}
