import { test, expect } from '@playwright/test';

test('continuing without login enters the app as a guest with no Log out link', async ({ page }) => {
  await page.goto('login');

  await page.getByText('Continue without login').click();

  await expect(page).toHaveURL(/\/app\/?$/);
  // "Your trips" heading is intentionally hidden in the zero-trips empty
  // state, so accept either it or the empty-state text as proof we landed
  // on Dashboard-home.
  await expect(page.getByRole('heading', { name: /your trips/i }).or(page.getByText('No trips yet'))).toBeVisible();
  await expect(page.getByText('Log out')).toHaveCount(0);
});
