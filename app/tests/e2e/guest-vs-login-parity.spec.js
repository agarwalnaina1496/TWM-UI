import { test, expect } from '@playwright/test';
import { mockTripCommandFlow } from './testUtils.js';

// TripContext no longer persists to localStorage, so auth state can only be
// seeded by actually driving the Login screen (mock, client-side only — see
// Login.jsx) rather than writing straight into a cached state blob. My Trips
// (not Itinerary) is the target here since it only needs auth + an empty
// trip list, not the prototype-only mock trip content the old seed carried.

test('guest can reach My Trips with no Log out link', async ({ page }) => {
  await mockTripCommandFlow(page, []);
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('my-trips');

  await expect(page.getByRole('heading', { name: /your trips/i })).toBeVisible();
  await expect(page.getByText('My Trips')).toBeVisible();
  await expect(page.getByText('Log out')).toHaveCount(0);
});

test('logged-in user can reach My Trips and sees Log out', async ({ page }) => {
  await mockTripCommandFlow(page, []);
  await page.goto('login');
  await page.getByPlaceholder('you@email.com').fill('t@example.com');
  await page.getByText('Continue →', { exact: true }).click();
  // In-app navigation, not page.goto — login() only sets in-memory auth
  // state (no backend session for it yet), so a hard navigation would
  // remount the app and lose it.
  await page.getByText('My Trips').click();

  await expect(page.getByRole('heading', { name: /your trips/i })).toBeVisible();
  await expect(page.getByText('My Trips')).toBeVisible();
  await expect(page.getByText('Log out')).toBeVisible();
});
