import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';

test('exact natural-language journey preserves nuance and hands off after two quick replies', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.getByPlaceholder(/Plan my Coorg trip/).fill(GOLDEN_QUERY);
  await page.getByLabel('Send').click();

  await expect(page).toHaveURL(/\/app\/scout-chat/);
  await expect(page.getByText(/Where will you be travelling from/)).toBeVisible();
  await page.getByRole('button', { name: 'Delhi', exact: true }).click();
  await expect(page.getByText(/what total budget would you like/)).toBeVisible();
  await page.getByRole('button', { name: '₹1,00,000 total for both', exact: true }).click();
  await expect(page.getByText(/I’ll look for a comfortable 14-day trip/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to destination discovery/ })).toBeVisible();

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')));
  expect(state.trip.tripContext.original_traveler_request).toBe(GOLDEN_QUERY);
  expect(state.trip.tripContext.weather_preference).toContain('no sub-zero/snowstorm situations unless it\'s a deliberate choice');
  expect(state.commandSnapshot.trip_state.active_agent).toBe('meridian');
});
