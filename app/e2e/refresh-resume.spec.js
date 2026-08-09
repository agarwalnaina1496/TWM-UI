import { test, expect } from '@playwright/test';

test('mid-flow refresh preserves trip state via localStorage', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  await page.getByText("I know where I'm going").click();
  await expect(page.getByText('Where are you headed?')).toBeVisible();
  await page.getByPlaceholder('Type your answer…').fill('Manali');
  await page.getByPlaceholder('Type your answer…').press('Enter');
  // Destination answered and persisted before the rest of the queue continues.
  await expect(page.getByText('Where are you starting your journey from?')).toBeVisible();

  await page.goto('trip-preview');
  await expect(page.getByRole('heading', { name: /manali/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /manali/i })).toBeVisible();
});
