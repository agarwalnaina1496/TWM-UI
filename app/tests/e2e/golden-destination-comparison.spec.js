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
      entryIntent: 'discover',
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
          stage: 'recommended', active_agent: 'meridian',
          trip_context: { original_traveler_request: GOLDEN_QUERY, origin: 'Delhi', budget: '₹1,00,000 total for both', duration_days: 14 },
          matcher_state: { conversation_context: { awaiting: null } },
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
          matcher_state: { conversation_context: { awaiting: null } },
        },
      })),
      recommendation: fixture,
    },
    {
      command: 'select_destination',
      response: commandResponse('Madhya Pradesh Heritage and Nature is confirmed.', tripRecord({
        version: 6,
        trip_state: { stage: 'matched', active_agent: null },
      })),
    },
    {
      // TWM-106: landing on the Plan Builder immediately bootstraps a real
      // Guide session — scripted so the route mock doesn't reject it.
      // Single-step generation: start_planning returns the complete plan
      // (places + day_plan together) — no separate approve_places step.
      command: 'start_planning',
      response: commandResponse('Here is your plan.', tripRecord({
        version: 7,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          trip_context: { destinations: ['Madhya Pradesh'], trip_duration: 1 },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Gwalior Fort'],
            day_plan: [{ day_number: 1, date: null, places: ['Gwalior Fort'], pace: 'relaxed', buffer_note: null }],
            revision: 1,
          },
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
  await page.getByRole('button', { name: 'See destinations →' }).click();

  await expect(page).toHaveURL(/\/app\/destinations/);
  await expect(page.getByText('A few that fit well')).toBeVisible();

  // The exact persisted budget must survive verbatim, never a generic bucket.
  await expect(page.getByText('₹1,00,000 total for both', { exact: true })).toBeVisible();

  // TWM-173: options render as columns in a criteria x options comparison
  // matrix, not separate cards — the detail card below shows whichever
  // column is focused (rank #1, Madhya Pradesh, by default).
  await expect(page.getByRole('button', { name: /Kerala Culture, Backwaters and Coast/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Assam/ })).toBeVisible();

  const detailCard = page.locator('.dest-detail-card');
  await expect(detailCard.getByText('Madhya Pradesh Heritage and Nature')).toBeVisible();

  // The verbatim weather qualifier from the golden fixture criteria survives the handoff.
  await detailCard.getByText('See why this fits').click();
  await expect(detailCard.getByText(/Winter days generally support sightseeing/)).toBeVisible();

  await detailCard.getByText('Plan this trip →').click();
  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await expect(page.getByText('Gwalior Fort')).toBeVisible();
});
