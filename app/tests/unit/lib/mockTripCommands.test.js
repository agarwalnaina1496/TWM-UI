import { describe, expect, it } from 'vitest';
import { ENTRY_INTENTS, GOLDEN_CONTEXT, GOLDEN_MESSAGES, GOLDEN_QUERY, GOLDEN_SCENARIO_ID } from '../../../src/data/entryCommandFixtures.js';
import { applyCommandSnapshot, createEntryCommand, executeMockEntryCommand } from '../../../src/lib/mockTripCommands.js';

function run(message, trip = {}, expectedVersion = 1) {
  return executeMockEntryCommand(createEntryCommand({ intent: ENTRY_INTENTS.ADVICE, message, expectedVersion }), trip);
}

describe('golden Scout command fixtures', () => {
  it('preserves the exact query and verbatim values while asking only origin', () => {
    const response = run(GOLDEN_QUERY);
    expect(response.message).toBe(GOLDEN_MESSAGES.askOrigin);
    expect(response.trip.trip_state.matcher_state.conversation_context.awaiting).toBe('origin');
    expect(response.trip.trip_state.trip_context).toMatchObject(GOLDEN_CONTEXT);
    expect(response.trip.trip_state.trip_context.original_traveler_request).toBe(GOLDEN_QUERY);
  });

  it('accepts Delhi, then the total-party budget, and hands off to Meridian', () => {
    const first = applyCommandSnapshot(run(GOLDEN_QUERY));
    const secondResponse = run('Delhi', first.tripPatch, first.commandSnapshot.version);
    expect(secondResponse.message).toBe(GOLDEN_MESSAGES.askBudget);
    expect(secondResponse.trip.trip_state.trip_context.origin).toBe('Delhi');
    expect(secondResponse.trip.trip_state.matcher_state.conversation_context.awaiting).toBe('budget');

    const second = applyCommandSnapshot(secondResponse);
    const finalResponse = run('₹1,00,000 total for both', second.tripPatch, second.commandSnapshot.version);
    expect(finalResponse.message).toBe(GOLDEN_MESSAGES.handoff);
    expect(finalResponse.trip.trip_state.active_agent).toBe('meridian');
    expect(finalResponse.trip.trip_state.stage).toBe('matching');
    expect(finalResponse.trip.trip_state.trip_context).toMatchObject({
      scenario_id: GOLDEN_SCENARIO_ID,
      origin: 'Delhi',
      budget: '₹1,00,000 total for both',
      weather_preference: GOLDEN_CONTEXT.weather_preference,
    });
  });

  it('keeps derived interpretation alongside the verbatim weather preference', () => {
    const context = run(GOLDEN_QUERY).trip.trip_state.trip_context;
    expect(context.weather_preference).toBe(GOLDEN_CONTEXT.weather_preference);
    expect(context.derived).toMatchObject({ avoid_extreme_heat: true, avoid_extreme_cold: true, snow_policy: 'deliberate_choice_only' });
  });
});
