import { test, expect } from '@playwright/test';
import { seedState } from './testUtils.js';

const TRIP = {
  destination: { type: 'single', name: 'Coorg', places: null },
  travelers: 2,
  budget: 'flexible',
  plan: 'self-led',
  days: [{ day: 1, title: 'Settle in', items: [{ id: 'd1a', text: 'Arrive + check in' }] }],
};

test('guest can reach the finished Self-Led itinerary with no Log out link', async ({ page }) => {
  await seedState(page, { trip: TRIP, auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
  await page.goto('itinerary');

  await expect(page.getByRole('heading', { name: /coorg/i })).toBeVisible();
  await expect(page.getByText('My Trips')).toBeVisible();
  await expect(page.getByText('Log out')).toHaveCount(0);
});

test('logged-in user can reach the finished Self-Led itinerary and sees Log out', async ({ page }) => {
  await seedState(page, { trip: TRIP, auth: { loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' } });
  await page.goto('itinerary');

  await expect(page.getByRole('heading', { name: /coorg/i })).toBeVisible();
  await expect(page.getByText('My Trips')).toBeVisible();
  await expect(page.getByText('Log out')).toBeVisible();
});
