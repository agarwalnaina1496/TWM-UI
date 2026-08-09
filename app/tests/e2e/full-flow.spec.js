import { test, expect } from '@playwright/test';

test('full fake-prototype flow: GetStarted through Itinerary', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  // GetStarted -> "Not sure yet" (discover) route
  await page.getByText('Not sure yet').click();
  await expect(page).toHaveURL(/\/app\/scout-chat/);

  // ScoutChat: answer the discover queue (origin, budget, travelers, month, style)
  await expect(page.getByText('Where are you starting your journey from?')).toBeVisible();
  await page.getByText('Bengaluru', { exact: true }).click();

  await expect(page.getByText("Roughly what's the budget, per person?")).toBeVisible();
  await page.getByText('Flexible', { exact: true }).click();

  await expect(page.getByText('How many people are traveling?')).toBeVisible();
  await page.getByText('2', { exact: true }).click();

  await expect(page.getByText('Which month are you thinking of traveling?')).toBeVisible();
  await page.getByText('Flexible / not sure').click();

  await expect(page.getByText(/vibe for this trip/)).toBeVisible();
  await page.getByText('Relaxing, good food, no rushing').click();

  await expect(page.getByText("That's everything I need")).toBeVisible();
  await page.getByText('Continue →').click();

  // Destinations
  await expect(page).toHaveURL(/\/app\/destinations/);
  await expect(page.getByText('A few that fit well')).toBeVisible();
  await page.getByText('Plan this trip →').first().click();

  // TripPreview
  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await page.getByText('✓ Approve places').click();
  await page.getByText('✓ Approve itinerary').click();

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
