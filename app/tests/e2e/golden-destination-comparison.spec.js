import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';
import { goldenMeridianFixture } from '../../src/data/goldenMeridianFixture.js';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

const ASK_ORIGIN = 'Where will you be travelling from?';
const ASK_BUDGET = 'And roughly what total budget would you like to stay within?';
const HANDOFF = 'I’ll look for a comfortable 14-day trip within budget.';

// Reproduces the exact golden journey through the real Destinations
// integration (TWM-104): free-form query -> Delhi -> ₹1,00,000 total for
// both -> real Meridian recommendations, ending in the Madhya Pradesh
// circuit being selected through the real select_destination command.
test('exact golden journey reaches real Meridian recommendations and selects Madhya Pradesh', async ({ page }) => {
  const fixture = goldenMeridianFixture();

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
          trip_context: { original_traveler_request: GOLDEN_QUERY, origin: 'Delhi' },
          matcher_state: { conversation_context: { awaiting: 'budget' } },
        },
      })),
    },
    {
      command: 'traveler_message',
      response: commandResponse(HANDOFF, tripRecord({
        version: 4,
        trip_state: {
          stage: 'matching', active_agent: 'meridian',
          trip_context: { original_traveler_request: GOLDEN_QUERY, origin: 'Delhi', budget: '₹1,00,000 total for both', duration_days: 14 },
        },
      })),
    },
    {
      command: 'continue',
      response: commandResponse(null, tripRecord({
        version: 5,
        trip_state: {
          stage: 'recommended', active_agent: null,
          trip_context: { original_traveler_request: GOLDEN_QUERY, origin: 'Delhi', budget: '₹1,00,000 total for both', duration_days: 14 },
          matcher_state: { conversation_context: { awaiting: null }, recommendations: [fixture] },
        },
      })),
    },
    {
      command: 'select_destination',
      response: commandResponse('Madhya Pradesh Heritage and Nature is confirmed.', tripRecord({
        version: 6,
        trip_state: { stage: 'matched', active_agent: null },
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
  await page.getByRole('button', { name: /Continue to destination discovery/ }).click();

  await expect(page).toHaveURL(/\/app\/destinations/);
  await expect(page.getByText('A few that fit well')).toBeVisible();

  // The exact persisted budget must survive verbatim, never a generic bucket.
  await expect(page.getByText('₹1,00,000 total for both', { exact: true })).toBeVisible();

  const mpCard = page.locator('.dest-card', { hasText: 'Madhya Pradesh Heritage and Nature' });
  await expect(page.locator('.dest-card', { hasText: 'Kerala Culture, Backwaters and Coast' })).toBeVisible();
  await expect(page.locator('.dest-card', { hasText: 'Assam' })).toBeVisible();

  // The verbatim weather qualifier from the golden fixture criteria survives the handoff.
  await mpCard.getByText('Why this one').click();
  await expect(mpCard.getByText(/Winter days generally support sightseeing/)).toBeVisible();

  await mpCard.getByText('Plan this trip →').click();
  await expect(page).toHaveURL(/\/app\/trip-preview/);
});
