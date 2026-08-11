import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

const ASK_ORIGIN = 'Where will you be travelling from?';
const ASK_BUDGET = 'And roughly what total budget would you like to stay within?';
const HANDOFF = 'I’ll look for a comfortable 14-day trip within budget.';

test('exact natural-language journey preserves nuance and hands off after two quick replies', async ({ page }) => {
  await mockTripCommandFlow(page, [
    {
      command: 'advice_entry',
      response: commandResponse(ASK_ORIGIN, tripRecord({
        version: 2,
        trip_state: {
          stage: 'new', active_agent: 'scout',
          trip_context: { original_traveler_request: GOLDEN_QUERY, weather_preference: "no sub-zero/snowstorm situations unless it's a deliberate choice" },
          matcher_state: { conversation_context: { awaiting: 'origin' } },
        },
      })),
    },
    {
      command: 'traveler_message',
      response: commandResponse(ASK_BUDGET, tripRecord({
        version: 3,
        trip_state: {
          stage: 'new', active_agent: 'scout',
          trip_context: { original_traveler_request: GOLDEN_QUERY },
          matcher_state: { conversation_context: { awaiting: 'budget' } },
        },
      })),
    },
    {
      command: 'traveler_message',
      response: commandResponse(HANDOFF, tripRecord({
        version: 4,
        trip_state: { stage: 'matching', active_agent: 'meridian', trip_context: { original_traveler_request: GOLDEN_QUERY } },
      })),
    },
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.getByPlaceholder(/Plan my Coorg trip/).fill(GOLDEN_QUERY);
  await page.getByLabel('Send').click();

  await expect(page).toHaveURL(/\/app\/scout-chat/);
  await expect(page.getByText(ASK_ORIGIN)).toBeVisible();
  await page.getByRole('button', { name: 'Delhi', exact: true }).click();
  await expect(page.getByText(ASK_BUDGET)).toBeVisible();
  await page.getByRole('button', { name: '₹1,00,000 total for both', exact: true }).click();
  await expect(page.getByText(HANDOFF)).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to destination discovery/ })).toBeVisible();

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')));
  expect(state.commandSnapshot.trip_state.trip_context.original_traveler_request).toBe(GOLDEN_QUERY);
  expect(state.commandSnapshot.trip_state.active_agent).toBe('meridian');
});
