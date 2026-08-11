import { test, expect } from '@playwright/test';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

function successOutcome() {
  return {
    status: 'SUCCESS', message: 'Great, here are a few options.', trip_type: 'single',
    traveler_criteria: [{ id: 'budget', label: '₹1,00,000 total for both', requirement_type: 'HARD', source_context_paths: ['budget'] }],
    options: [{
      rank: 1, type: 'single', name: 'Coorg', destination_id: 'coorg', summary: 'A comfortable fit within budget.',
      evaluations: [{ criterion_id: 'budget', outcome: 'MATCH', conclusion: 'Fits within budget.', details: [{ type: 'bullets', items: ['Estimated total stays within budget.'] }] }],
      other_considerations: [],
    }],
  };
}

test('full flow: GetStarted through Dashboard', async ({ page }) => {
  await mockTripCommandFlow(page, [
    {
      command: 'discover_entry',
      response: commandResponse('And roughly what total budget would you like to stay within?', tripRecord({
        version: 2,
        trip_state: { stage: 'matching', active_agent: 'meridian', matcher_state: { conversation_context: { awaiting: 'budget' } } },
      })),
    },
    {
      command: 'traveler_message',
      response: commandResponse('Great, here are a few options.', tripRecord({
        version: 3,
        trip_state: { stage: 'recommended', active_agent: null },
      })),
    },
    {
      command: 'continue',
      response: commandResponse(null, tripRecord({
        version: 4,
        trip_state: { stage: 'recommended', active_agent: null, matcher_state: { conversation_context: { awaiting: null }, recommendations: [successOutcome()] } },
      })),
    },
    {
      command: 'select_destination',
      response: commandResponse('Coorg is confirmed.', tripRecord({
        version: 5,
        trip_state: { stage: 'matched', active_agent: null, matcher_state: { conversation_context: { awaiting: null }, recommendations: [successOutcome()] } },
      })),
    },
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  // GetStarted -> "Not sure yet" (discover) route: discover_entry fires immediately on entry
  await page.getByText('Not sure yet').click();
  await expect(page).toHaveURL(/\/app\/journey-entry/);
  await expect(page.getByText('And roughly what total budget would you like to stay within?')).toBeVisible();
  await page.getByRole('button', { name: '₹1,00,000 total for both' }).click();
  await expect(page.getByRole('button', { name: 'See destinations →' })).toBeVisible();
  await page.getByText('See destinations →').click();

  // Destinations (real Meridian recommendations via the continue command)
  await expect(page).toHaveURL(/\/app\/destinations/);
  await expect(page.getByText('A few that fit well')).toBeVisible();
  await page.getByText('Plan this trip →').first().click();

  // TripPreview
  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await page.getByText('Generate detailed itinerary →').click();

  // ChoosePlan -> Self-Led
  await expect(page).toHaveURL(/\/app\/choose-plan/);
  await expect(page.getByRole('button', { name: 'Choose TWM-Led →' })).toBeDisabled();
  await page.getByText('Choose Self-Led →').click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole('navigation', { name: 'Trip Dashboard tabs' })).toBeVisible();
});
