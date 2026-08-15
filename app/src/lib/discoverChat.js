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
// Presentation-only: no raw transcript is persisted or reconstructed, just
// a recap sentence built from the same persisted trip_context/awaiting
// fields the rest of the app already reads. Returns null when there's
// nothing to recap yet, so the caller falls back to the normal greeting.
export function buildRecapTurn(tripState, { awaiting } = {}) {
  if (!hasTripContext(tripState)) return null;
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
