import { ENTRY_INTENTS, GOLDEN_CONTEXT, GOLDEN_MESSAGES, GOLDEN_QUERY, GOLDEN_SCENARIO_ID, MOCK_TRIP_ID } from '../data/entryCommandFixtures.js';

function canonicalTripContext(currentTrip = {}) {
  return { ...(currentTrip.tripContext || {}), ...Object.fromEntries(Object.entries({
    destination: currentTrip.destination || undefined,
    origin: currentTrip.origin || undefined,
    budget: currentTrip.budget === 'flexible' ? undefined : currentTrip.budget,
  }).filter(([, value]) => value !== undefined)) };
}

function tripResponse({ currentTrip, context, stage, activeAgent, awaiting, version, intent }) {
  const now = '2026-08-10T00:00:00.000Z';
  return {
    id: MOCK_TRIP_ID, title: context.destination ? `Trip to ${context.destination}` : 'New trip', product_mode: 'self_led',
    trip_state: {
      stage, active_agent: activeAgent, trip_context: context,
      advisor_state: { conversation_context: {} },
      matcher_state: { conversation_context: { awaiting } }, planner_state: {},
    },
    ui_state: { entry_intent: intent }, version: Math.max(1, version + 1), created_at: now, updated_at: now,
    prototype_trip: currentTrip,
  };
}

export function createEntryCommand({ intent, message = null, destination = null, expectedVersion = 1, idempotencyKey = 'fixture-key' }) {
  return { command: 'start_journey', entry_intent: intent, message, destination, expected_version: expectedVersion, idempotency_key: idempotencyKey };
}

export function executeMockEntryCommand(command, currentTrip = {}) {
  let context = canonicalTripContext(currentTrip);
  let message; let stage; let activeAgent; let awaiting = null; let agentMeta = null;
  if (command.entry_intent === ENTRY_INTENTS.ADVICE) {
    const input = command.message?.trim();
    if (!input) throw new Error('Advice requires a traveler message.');
    agentMeta = { agent: 'scout', prompt_version: 'scout-v1-fixture' };
    if (input === GOLDEN_QUERY || /2-week end-of-year trip/i.test(input)) {
      context = { ...GOLDEN_CONTEXT };
      message = GOLDEN_MESSAGES.askOrigin; stage = 'new'; activeAgent = 'scout'; awaiting = 'origin';
    } else if (context.scenario_id === GOLDEN_SCENARIO_ID && !context.origin && input.toLowerCase() === 'delhi') {
      context = { ...context, origin: 'Delhi' };
      message = GOLDEN_MESSAGES.askBudget; stage = 'new'; activeAgent = 'scout'; awaiting = 'budget';
    } else if (context.scenario_id === GOLDEN_SCENARIO_ID && context.origin === 'Delhi' && /1,?00,?000|1\s*lakh/i.test(input)) {
      context = { ...context, budget: '₹1,00,000 total for both' };
      message = GOLDEN_MESSAGES.handoff; stage = 'matching'; activeAgent = 'meridian';
    } else {
      message = 'Which destination or travel concern would you like advice about?'; stage = 'new'; activeAgent = 'scout'; awaiting = 'travel_question';
    }
  } else if (command.entry_intent === ENTRY_INTENTS.DISCOVER) {
    message = 'Let’s find destinations that fit what matters to you.'; stage = 'matching'; activeAgent = 'meridian';
  } else if (command.entry_intent === ENTRY_INTENTS.KNOWN_DESTINATION) {
    if (!command.destination?.trim()) return { status: 'NEEDS_INPUT', message: 'Tell us the destination before starting the plan.', missing_fields: ['destination'] };
    context = { ...context, destination: command.destination.trim() };
    message = `Ready to start planning ${context.destination}.`; stage = 'planning'; activeAgent = 'guide';
  } else throw new Error('Unsupported entry intent.');
  const version = Number.isInteger(command.expected_version) ? command.expected_version : 1;
  return { status: 'SUCCESS', trip: tripResponse({ currentTrip, context, stage, activeAgent, awaiting, version, intent: command.entry_intent }), message, agent_meta: agentMeta };
}

export function safeExecuteMockEntryCommand(command, currentTrip = {}) {
  try { return { data: executeMockEntryCommand(command, currentTrip), error: null }; }
  catch (error) { return { data: null, error: error instanceof Error ? error.message : 'Mock command failed.' }; }
}

export function applyCommandSnapshot(response) {
  if (response?.status !== 'SUCCESS' || !response.trip?.trip_state) throw new Error('Authoritative trip snapshot is missing.');
  const context = response.trip.trip_state.trip_context;
  return {
    tripPatch: {
      destination: context.destination ?? '', origin: context.origin ?? '', budget: context.budget ?? 'flexible',
      style: context.traveler_style ?? '', travelers: context.derived?.traveler_count ?? 2,
      month: context.travel_window ?? 'flexible', scenarioId: context.scenario_id ?? null, tripContext: context,
    },
    commandSnapshot: response.trip,
  };
}
