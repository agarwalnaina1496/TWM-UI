import { test, expect } from '@playwright/test';

test('full fake-prototype flow: GetStarted through Itinerary', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  // GetStarted -> "Not sure yet" (discover) route
  await page.getByText('Not sure yet').click();
  await expect(page).toHaveURL(/\/app\/journey-entry/);
  await page.getByText('See destinations →').click();

  // Destinations
  await expect(page).toHaveURL(/\/app\/destinations/);
  await expect(page.getByText('A few that fit well')).toBeVisible();
  await page.getByText('Plan this trip →').first().click();

  // TripPreview
  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await page.getByText('Generate detailed itinerary →').click();

  // ChoosePlan -> Self-Led
  await expect(page).toHaveURL(/\/app\/choose-plan/);
  await page.getByText('Get my itinerary →').click();

  // Logistics: bring-your-own-booking path
  await expect(page).toHaveURL(/\/app\/logistics/);
  await page.getByText('Upload booking confirmation').click();
  await expect(page.getByText('✓ Confirmation added')).toBeVisible();
  await page.getByText('See my detailed itinerary →').click();

  // Itinerary
  await expect(page).toHaveURL(/\/app\/itinerary/);
  await expect(page.getByText('Fixture-backed preview — not a live Atlas result')).toBeVisible();
});
