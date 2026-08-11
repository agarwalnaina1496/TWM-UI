import { test, expect } from '@playwright/test';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

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

  // Destinations (local mock data, unaffected by real trip commands)
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
