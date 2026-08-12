import { test, expect } from '@playwright/test';
import { mockTripCommandFlow, tripRecord, readyItineraryState } from './testUtils.js';

// TWM-108: adaptive `/` landing resolver + My Trips. TripContext always
// re-fetches trips from the Backend on mount, so every scenario here is
// driven entirely through the mocked GET /api/trips[/id] persistence layer
// (mockTripCommandFlow's `initialTrips`), matching refresh-resume.spec.js's
// convention rather than any client-side fixture.

test('zero trips lands on GetStarted', async ({ page }) => {
  await mockTripCommandFlow(page, []);
  await page.goto('');
  await expect(page.getByRole('heading', { name: /where are we headed/i })).toBeVisible();
});

test('one incomplete trip resumes straight into its owning specialist', async ({ page }) => {
  const trip = tripRecord({
    trip_state: { stage: 'matching', active_agent: 'meridian', trip_context: { origin: 'Delhi' } },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('');
  await expect(page).toHaveURL(/\/app\/scout-chat/);
});

test('one itinerary-ready trip opens the Dashboard directly', async ({ page }) => {
  const trip = tripRecord({
    trip_state: { stage: 'planned', active_agent: null, itinerary_state: readyItineraryState() },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('');
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByText('Abbey Falls Getaway')).toBeVisible();
});

test('multiple meaningful trips land on My Trips with stage-aware cards', async ({ page }) => {
  const active = tripRecord({
    id: 'e2e-trip-1', title: 'Coorg weekend',
    trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } },
    updated_at: '2026-01-02T00:00:00.000Z',
  });
  const upcoming = tripRecord({
    id: 'e2e-trip-2', title: 'Madhya Pradesh circuit',
    trip_state: { stage: 'planned', itinerary_state: readyItineraryState() },
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  await mockTripCommandFlow(page, [], { initialTrips: [active, upcoming] });
  await page.goto('');
  await expect(page).toHaveURL(/\/app\/my-trips/);
  await expect(page.getByText('Coorg weekend')).toBeVisible();
  await expect(page.getByText('Madhya Pradesh circuit')).toBeVisible();
  await expect(page.getByText('In conversation')).toBeVisible();
  await expect(page.getByText('Itinerary ready')).toBeVisible();
});

test('a completed-only trip lands on My Trips instead of auto-resuming', async ({ page }) => {
  const trip = tripRecord({ trip_state: { stage: 'done', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('');
  await expect(page).toHaveURL(/\/app\/my-trips/);
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
});

test('deep link to My Trips bypasses the resolver even with one resumable trip', async ({ page }) => {
  const trip = tripRecord({ trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('my-trips');
  await expect(page).toHaveURL(/\/app\/my-trips/);
  await expect(page.getByRole('heading', { name: /your.*trips/i })).toBeVisible();
});

test('+ New Trip starts a separate Backend journey and preserves the existing trip', async ({ page }) => {
  const existing = tripRecord({ id: 'e2e-trip-1', title: 'Coorg weekend', trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [existing] });

  await page.goto('my-trips');
  await expect(page.getByText('Coorg weekend')).toBeVisible();
  await page.getByText('+ New trip').click();

  await expect(page.getByRole('heading', { name: /where are we headed/i })).toBeVisible();

  await page.goto('my-trips');
  await expect(page.getByText('Coorg weekend')).toBeVisible();
});

test('renaming a trip persists through the Backend and survives a refresh', async ({ page }) => {
  const trip = tripRecord({ id: 'e2e-trip-1', title: 'Coorg weekend', trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });

  await page.goto('my-trips');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator('input.name').fill('Coorg long weekend');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Coorg long weekend')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Coorg long weekend')).toBeVisible();
});

test('filters narrow My Trips to the selected category', async ({ page }) => {
  const active = tripRecord({
    id: 'e2e-trip-1', title: 'Coorg weekend',
    trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } },
    updated_at: '2026-01-02T00:00:00.000Z',
  });
  const upcoming = tripRecord({
    id: 'e2e-trip-2', title: 'Madhya Pradesh circuit',
    trip_state: { stage: 'planned', itinerary_state: readyItineraryState() },
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  await mockTripCommandFlow(page, [], { initialTrips: [active, upcoming] });
  await page.goto('my-trips');

  await page.getByRole('tab', { name: /^Upcoming/ }).click();
  await expect(page.getByText('Madhya Pradesh circuit')).toBeVisible();
  await expect(page.getByText('Coorg weekend')).not.toBeVisible();

  await page.getByRole('tab', { name: /^Active/ }).click();
  await expect(page.getByText('Coorg weekend')).toBeVisible();
  await expect(page.getByText('Madhya Pradesh circuit')).not.toBeVisible();
});

test('a fresh trip with no traveler context does not clutter My Trips or crash landing', async ({ page }) => {
  const empty = tripRecord({ trip_state: {} });
  await mockTripCommandFlow(page, [], { initialTrips: [empty] });
  await page.goto('');
  // Malformed/empty trip_state fails closed to GetStarted rather than crashing or
  // showing a phantom card.
  await expect(page.getByRole('heading', { name: /where are we headed/i })).toBeVisible();

  await page.goto('my-trips');
  await expect(page.getByText('Nothing saved yet.')).toBeVisible();
});
