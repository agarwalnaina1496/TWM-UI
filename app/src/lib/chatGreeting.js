import { buildRecapTurn } from './discoverChat.js';
import { buildPlanRecapTurn } from './planChat.js';

const COLD_OPEN = "Hey there! I'm Scout. Tell me about the trip you have in mind — a question, a rough idea, or the whole plan — and I'll take it from there.";

// TWM-234: the resumed-conversation greeting, shared between ScoutChat.jsx
// (the standalone page) and any other surface embedding a ChatConversation
// for a trip that already exists (e.g. Dashboard's Overview tab) — one
// recap-selection rule, not two copies that can drift.
export function resumedGreeting(view, { activeAgent, awaiting }) {
  const recap = activeAgent === 'guide'
    ? buildPlanRecapTurn(view, { awaiting })
    : buildRecapTurn(view, { awaiting });
  return [recap || COLD_OPEN];
}
