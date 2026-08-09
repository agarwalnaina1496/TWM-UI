import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'twm_prototype_state_v1';

const TRIP = {
  destination: 'Coorg',
  travelers: 2,
  budget: 'flexible',
  plan: 'self-led',
  days: [{ day: 1, title: 'Settle in', items: [{ id: 'd1a', text: 'Arrive + check in' }] }],
};

async function seedState(page, auth) {
  // Land on an in-app page first so localStorage is set on the app's own origin/path.
  await page.goto('login');
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: { trip: TRIP, auth, savedTrips: [] } }
  );
}

test('guest can reach the finished Self-Led itinerary with no Log out link', async ({ page }) => {
  await seedState(page, { loggedIn: false, isGuest: true, name: 'Guest', email: '' });
  await page.goto('itinerary');

  await expect(page.getByRole('heading', { name: /coorg/i })).toBeVisible();
  await expect(page.getByText('My Trips')).toBeVisible();
  await expect(page.getByText('Log out')).toHaveCount(0);
});

test('logged-in user can reach the finished Self-Led itinerary and sees Log out', async ({ page }) => {
  await seedState(page, { loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
  await page.goto('itinerary');

  await expect(page.getByRole('heading', { name: /coorg/i })).toBeVisible();
  await expect(page.getByText('My Trips')).toBeVisible();
  await expect(page.getByText('Log out')).toBeVisible();
});
