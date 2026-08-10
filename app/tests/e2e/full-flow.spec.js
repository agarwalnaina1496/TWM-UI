import { test, expect } from '@playwright/test';

test('full fake-prototype flow: GetStarted through Itinerary', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  // GetStarted -> "Not sure yet" (discover) route
  await page.getByText('Not sure yet').click();
  await expect(page).toHaveURL(/\/app\/journey-entry/);
  await page.getByRole('button', { name: 'Planning a 2-week end-of-year India trip with mild weather' }).click();
  await page.getByRole('button', { name: 'Delhi' }).click();
  await page.getByRole('button', { name: '₹1,00,000 total for both' }).click();
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
  await expect(page.getByRole('button', { name: 'Choose TWM-Led →' })).toBeDisabled();
  await page.getByText('Choose Self-Led →').click();

  // Logistics -> Dashboard
  await expect(page).toHaveURL(/\/app\/logistics/);
  await page.getByRole('button', { name: /Continue to dashboard/ }).click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole('navigation', { name: 'Trip Dashboard tabs' })).toBeVisible();
});
