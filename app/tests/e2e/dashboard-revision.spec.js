import { test, expect } from '@playwright/test';
import { createAtlasDashboardState } from '../../src/lib/mockAtlasTrip.js';

async function seedDashboard(page) {
  const atlasState = { ...createAtlasDashboardState(), mode: 'self-led' };
  await page.goto('login');
  await page.evaluate(state => localStorage.setItem('twm_prototype_state_v1', JSON.stringify({
    auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' },
    trip: { plan: 'self-led', destination: { name: 'Madhya Pradesh Heritage and Nature' }, travelers: 2, atlasState: state },
  })), atlasState);
  await page.goto('dashboard');
}

test('confirmed arrival requires explicit review before Days version changes', async ({ page }) => {
  await seedDashboard(page);
  await page.getByRole('button', { name: 'Transport' }).click();
  await page.getByRole('button', { name: /Simulate confirmed 2:00 PM arrival/ }).click();
  await expect(page.getByText('Booking affects Days 1 and 3')).toBeVisible();

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')).trip.atlasState);
  expect(state.current_version_id).toBe('atlas-v1');
  expect(state.versions).toHaveLength(1);

  await page.getByRole('button', { name: 'Keep current' }).click();
  await expect(page.getByText('Booking affects Days 1 and 3')).not.toBeVisible();
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')).trip.atlasState);
  expect(state.current_version_id).toBe('atlas-v1');
});

test('Accept changes activates version 2 and keeps version 1 recoverable', async ({ page }) => {
  await seedDashboard(page);
  await page.getByRole('button', { name: 'Transport' }).click();
  await page.getByRole('button', { name: /Simulate confirmed 2:00 PM arrival/ }).click();
  await page.getByRole('button', { name: 'Accept changes' }).click();
  await page.getByRole('button', { name: 'Days' }).click();
  await expect(page.getByText('No dates confirmed · Itinerary version 2')).toBeVisible();
  await expect(page.getByText('Confirmed arrival in Gwalior')).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')).trip.atlasState);
  expect(state.current_version_id).toBe('atlas-v2');
  expect(state.versions.map(version => version.status)).toEqual(['HISTORICAL', 'CURRENT']);
});

test('Dashboard requires Self-Led and uploaded booking state survives refresh', async ({ page }) => {
  const atlasState = createAtlasDashboardState();
  await page.goto('login');
  await page.evaluate(state => localStorage.setItem('twm_prototype_state_v1', JSON.stringify({
    auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' },
    trip: { plan: null, atlasState: state },
  })), atlasState);
  await page.goto('dashboard');
  await expect(page).toHaveURL(/\/app\/choose-plan/);

  await page.getByRole('button', { name: 'Choose Self-Led →' }).click();
  await page.getByRole('button', { name: 'Bookings' }).click();
  await page.getByRole('button', { name: 'Upload confirmation' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')).trip.atlasState.bookings.length)).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Bookings' }).click();
  await expect(page.getByText('Uploaded confirmation')).toBeVisible();
});
