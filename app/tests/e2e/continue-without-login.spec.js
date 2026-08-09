import { test, expect } from '@playwright/test';

test('continuing without login enters the app as a guest with no Log out link', async ({ page }) => {
  await page.goto('login');

  await page.getByText('Continue without login').click();

  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByText('My Trips')).toBeVisible();
  await expect(page.getByText('Log out')).toHaveCount(0);
});
