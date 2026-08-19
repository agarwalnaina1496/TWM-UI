import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

const ASK_ORIGIN = 'Where will you be travelling from?';
const ASK_BUDGET = 'And roughly what total budget would you like to stay within?';
const HANDOFF = 'I’ll look for a comfortable 14-day trip within budget.';

test('exact natural-language journey preserves nuance and hands off after two quick replies', async ({ page }) => {
  await mockTripCommandFlow(page, [
    {
      command: 'discover_entry',
      response: commandResponse(ASK_ORIGIN, tripRecord({
        version: 2,
        trip_state: {
          stage: 'new', active_agent: 'scout',
          trip_context: { original_traveler_request: GOLDEN_QUERY, weather_preference: "no sub-zero/snowstorm situations unless it's a deliberate choice" },
          matcher_state: { conversation_context: { awaiting: 'origin_city' } },
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
        trip_state: {
          stage: 'recommended', active_agent: 'meridian', trip_context: { original_traveler_request: GOLDEN_QUERY },
          matcher_state: { conversation_context: { awaiting: null } },
        },
      })),
    },
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.getByText('Discover Destination').click();
  await expect(page).toHaveURL(/\/app\/journey-entry/);
  await page.getByPlaceholder('Tell Scout about your trip…').fill(GOLDEN_QUERY);
  await page.getByLabel('Send').click();

  await expect(page.getByText(ASK_ORIGIN)).toBeVisible();
  await page.getByRole('button', { name: 'Delhi', exact: true }).click();
  await expect(page.getByText(ASK_BUDGET)).toBeVisible();
  await page.getByRole('button', { name: '₹1,00,000 total for both', exact: true }).click();
  await expect(page.getByText(HANDOFF)).toBeVisible();
  // Meridian owns the trip and isn't awaiting a clarification answer, so
  // it's ready to produce recommendations — the button surfaces now,
  // rather than the instant handoff happens (which would invite leaving
  // this chat window mid-clarification, before Meridian even asked anything).
  await expect(page.getByRole('button', { name: 'See destinations →' })).toBeVisible();

  // TripContext no longer mirrors state to localStorage — read the Backend's
  // own record of the trip (via the mocked /api/trips list, fetched through
  // the page itself so it hits the page.route mock — page.request would
  // bypass that routing) instead of a client-side cache, confirming context
  // survived the two-turn handoff.
  const { trips } = await page.evaluate(() => fetch('/api/trips', { credentials: 'include' }).then(r => r.json()));
  expect(trips[0].trip_state.trip_context.original_traveler_request).toBe(GOLDEN_QUERY);
  expect(trips[0].trip_state.active_agent).toBe('meridian');
});
