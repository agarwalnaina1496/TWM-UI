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

  // Atlas detailed itinerary exists before bookings or dates.
  await expect(page).toHaveURL(/\/app\/itinerary-preview/);
  await expect(page.getByText('Duration-only · Day 1–14')).toBeVisible();
  await page.getByText('Choose how to manage this trip →').click();

  // ChoosePlan -> Self-Led
  await expect(page).toHaveURL(/\/app\/choose-plan/);
  await expect(page.getByRole('button', { name: 'TWM-Led is Coming Soon' })).toBeDisabled();
  await page.getByText('Open my Self-Led Dashboard →').click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole('navigation', { name: 'Trip Dashboard tabs' })).toBeVisible();
});
