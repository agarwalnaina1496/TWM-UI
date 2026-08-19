import { test, expect } from '@playwright/test';
import { mockTripCommandFlow } from './testUtils.js';

// TripContext no longer persists to localStorage, so auth state can only be
// seeded by actually driving the login overlay (mock, client-side only —
// see LoginModal.jsx) rather than writing straight into a cached state blob.
// Dashboard-home (`/my-trips`) is the target here since it only needs auth +
// an empty trip list, not the prototype-only mock trip content the old seed
// carried.
//
// GET /api/auth/me is unmocked by mockTripCommandFlow (it only covers
// /api/trips) — left unmocked, it falls through to a real network call that
// 404s to the Vite SPA fallback (200 + HTML), which authApi's request()
// then treats as a truthy empty-object "logged in" user. Both specs mock
// /api/auth/** explicitly so checkSession() reflects the intended state
// rather than that fallback.

test('guest can reach Dashboard-home with no Log out link', async ({ page }) => {
  await mockTripCommandFlow(page, []);
  await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { detail: 'Not authenticated' } }));
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('my-trips');

  await expect(page.getByRole('heading', { name: /your trips/i })).toBeVisible();
  await expect(page.getByText('Log out')).toHaveCount(0);
});

test('logged-in user can reach Dashboard-home and sees Log out', async ({ page }) => {
  await mockTripCommandFlow(page, []);
  // The Dashboard-home navigation below is a full page.goto (fresh SPA
  // mount), so checkSession()'s GET /me has to reflect the login that
  // already happened rather than always answering 401 — mirrors a real
  // session cookie surviving the reload.
  let loggedIn = false;
  await page.route('**/api/auth/me', route => (loggedIn
    ? route.fulfill({ json: { email: 't@example.com' } })
    : route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })));
  await page.route('**/api/auth/login', route => {
    loggedIn = true;
    return route.fulfill({ json: { email: 't@example.com' } });
  });
  await page.goto('login');
  await page.getByPlaceholder('you@email.com').fill('t@example.com');
  await page.locator('.field-input[type="password"]').fill('correct-horse-battery-staple');
  await page.getByText('Continue →', { exact: true }).click();
  await page.goto('my-trips');

  await expect(page.getByRole('heading', { name: /your trips/i })).toBeVisible();
  await expect(page.getByText('Log out')).toBeVisible();
});
