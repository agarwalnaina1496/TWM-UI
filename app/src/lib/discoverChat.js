import { contextRecapPills, hasContext } from './tripLifecycle.js';

// TWM-173/TWM-220: shared helpers for the Discover entry chat (ScoutChat's
// resume path). Operates on a `TripView` — `context_recap` (composed) and
// `matcher.last_message` (Meridian's verbatim last turn).

function humanize(field) {
  return String(field).replace(/_/g, ' ');
}

// A refresh must not show Scout's cold-open greeting again once real context
// exists — that reads as the product forgetting everything the traveler
// already said. Returns null when there is nothing to recap yet, so the
// caller falls back to the normal greeting.
//
// Prefers Meridian's real last message (already phrased as a genuine
// follow-up) over a synthesized recap; only falls back to the synthesized
// line for trips that never had a real last message saved.
export function buildRecapTurn(view, { awaiting } = {}) {
  if (!hasContext(view)) return null;
  const lastMessage = view?.matcher?.last_message;
  if (typeof lastMessage === 'string' && lastMessage.trim()) return lastMessage;
  const pills = contextRecapPills(view);
  let text = 'Picking up where you left off';
  text += pills.length > 0 ? ` — ${pills.join(', ')}.` : '.';
  if (awaiting) text += ` I still need to know about ${humanize(awaiting)} — want to pick that up?`;
  return text;
}

// A hand-off note fires exactly once, only on the actual scout->specialist
// transition — not on every render where the specialist already owns the
// trip. Covers scout->guide too.
export function didHandoffOccur(previousAgent, nextAgent) {
  return previousAgent === 'scout' && (nextAgent === 'meridian' || nextAgent === 'guide');
}
