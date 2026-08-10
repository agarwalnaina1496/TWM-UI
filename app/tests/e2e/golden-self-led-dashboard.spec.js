import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';

test('exact golden journey reaches Atlas preview, Choose Plan and Self-Led Dashboard', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.getByPlaceholder(/Plan my Coorg trip/).fill(GOLDEN_QUERY);
  await page.getByLabel('Send').click();
  await page.getByRole('button', { name: 'Delhi' }).click();
  await page.getByRole('button', { name: '₹1,00,000 total for both' }).click();
  await page.getByRole('button', { name: /Continue to destination discovery/ }).click();

  await expect(page).toHaveURL(/\/app\/destinations/);
  const mp = page.locator('.dest-card').filter({ hasText: 'Madhya Pradesh Heritage and Nature' });
  await mp.getByText('Plan this trip →').click();
  await page.getByRole('button', { name: /Generate detailed itinerary/ }).click();

  await expect(page).toHaveURL(/\/app\/itinerary-preview/);
  await expect(page.getByText('What Atlas is assuming')).toBeVisible();
  await expect(page.getByText('₹60,000–₹82,000 for two')).toBeVisible();
  await page.getByRole('button', { name: /Choose how to manage this trip/ }).click();

  await expect(page).toHaveURL(/\/app\/choose-plan/);
  await expect(page.getByRole('button', { name: 'TWM-Led is Coming Soon' })).toBeDisabled();
  await page.getByRole('button', { name: /Open my Self-Led Dashboard/ }).click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole('button', { name: 'Days' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('No dates confirmed · Itinerary version 1')).toBeVisible();
});
