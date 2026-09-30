import { test, expect } from '@playwright/test';
import { mockTripCommandFlow, tripRecord, commandResponse, readyItineraryState } from './testUtils.js';

// TWM-163: `/` always renders Dashboard-home directly, for any trip count
// or stage (including zero trips, which shows Dashboard-home's own empty
// state). No auto-resume or auto-open-Dashboard from landing anymore —
// that only happens from an explicit trip-card click. TWM-164: the
// persistent header nav ("Plan a Trip" / "Discover Destination") is the
// entry point into a journey — there's no intermediate GetStarted screen.

test('zero trips lands on Dashboard-home with its own empty state', async ({ page }) => {
  // The "Your trips" heading is intentionally absent in the empty state --
  // there's nothing to list yet, so the empty-state copy carries the page
  // on its own instead of repeating a list title over an empty list.
  await mockTripCommandFlow(page, []);
  await page.goto('');
  await expect(page.getByRole('heading', { name: /your.*trips/i, level: 1 })).toHaveCount(0);
  await expect(page.getByText('No trips yet')).toBeVisible();
});

test('one incomplete trip lands on Dashboard-home, not an auto-resume', async ({ page }) => {
  const trip = tripRecord({
    trip_state: { stage: 'matching', active_agent: 'meridian', trip_context: { origin: 'Delhi' } },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('');
  await expect(page.getByRole('heading', { name: /your.*trips/i, level: 1 })).toBeVisible();
});

test('one itinerary-ready trip lands on Dashboard-home, not an auto-open Dashboard', async ({ page }) => {
  const trip = tripRecord({
    trip_state: { stage: 'planned', active_agent: null, itinerary_state: readyItineraryState() },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('');
  await expect(page.getByRole('heading', { name: /your.*trips/i, level: 1 })).toBeVisible();
  await expect(page.getByText('Itinerary ready')).toBeVisible();
});

test('multiple meaningful trips land on Dashboard-home with stage-aware cards', async ({ page }) => {
  // TWM-232: My Trips groups by date, not lifecycle stage -- every trip
  // uses the same uniform card. `active` (stage "matching", no destination
  // yet) has no real title, only its honest stage badge; `upcoming` has a
  // real title and its itinerary-ready badge.
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
  await expect(page.getByRole('heading', { name: /your.*trips/i, level: 1 })).toBeVisible();
  await expect(page.getByText('In conversation')).toBeVisible();
  await expect(page.getByText('Madhya Pradesh circuit')).toBeVisible();
  await expect(page.getByText('Itinerary ready')).toBeVisible();
});

test('a completed-only trip lands on Dashboard-home instead of auto-resuming', async ({ page }) => {
  const trip = tripRecord({ trip_state: { stage: 'done', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('');
  await expect(page.getByRole('heading', { name: /your.*trips/i, level: 1 })).toBeVisible();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
});

test('deep link to /my-trips renders the same Dashboard-home', async ({ page }) => {
  const trip = tripRecord({ trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });
  await page.goto('my-trips');
  await expect(page).toHaveURL(/\/app\/my-trips/);
  await expect(page.getByRole('heading', { name: /your.*trips/i, level: 1 })).toBeVisible();
});

test('header "Plan a Trip" starts a separate Backend journey and preserves the existing trip', async ({ page }) => {
  // Committed (not discover-only) so the trip's real title renders --
  // this test is about the existing trip surviving navigation, not about
  // explore-card presentation (see the discover-only-rail test for that).
  const existing = tripRecord({ id: 'e2e-trip-1', title: 'Coorg weekend', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [existing] });

  await page.goto('');
  await expect(page.getByText('Coorg weekend')).toBeVisible();
  await page.getByText('Plan a Trip').click();

  await expect(page).toHaveURL(/\/app\/journey-entry\?intent=known_destination/);

  await page.goto('');
  await expect(page.getByText('Coorg weekend')).toBeVisible();
});

test('Dashboard-home empty state offers the same two entry actions as the header', async ({ page }) => {
  await mockTripCommandFlow(page, []);
  await page.goto('');
  await expect(page.getByText('No trips yet')).toBeVisible();

  await page.getByText('Discover Destination', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/journey-entry\?intent=discover_destination/);
});

test('renaming a trip persists through the Backend and survives a refresh', async ({ page }) => {
  const trip = tripRecord({ id: 'e2e-trip-1', title: 'Coorg weekend', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [trip] });

  await page.goto('');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator('input.name').fill('Coorg long weekend');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Coorg long weekend')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Coorg long weekend')).toBeVisible();
});

test('search narrows Dashboard-home to matching trips only (TWM-172)', async ({ page }) => {
  const active = tripRecord({
    id: 'e2e-trip-1', title: 'Coorg weekend',
    trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } },
    updated_at: '2026-01-02T00:00:00.000Z',
  });
  const upcoming = tripRecord({
    id: 'e2e-trip-2', title: 'Madhya Pradesh circuit',
    trip_state: { stage: 'planned', itinerary_state: readyItineraryState() },
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  await mockTripCommandFlow(page, [], { initialTrips: [active, upcoming] });
  await page.goto('');

  await page.getByLabel('Search your trips').fill('madhya');
  await expect(page.getByText('Madhya Pradesh circuit')).toBeVisible();
  await expect(page.getByText('Coorg weekend')).not.toBeVisible();
});

test('a discover-only trip (no destination yet) shows in Your trips with no title (TWM-232)', async ({ page }) => {
  // TWM-232: My Trips groups by date now, not by whether a destination is
  // chosen -- there is no separate explore rail any more. A discover-only
  // trip renders the same uniform card as everything else, just with no
  // title/Rename yet (nothing real to name) and its honest stage badge.
  const browsing = tripRecord({
    id: 'e2e-trip-1', title: 'Untitled Trip',
    trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [browsing] });
  await page.goto('');

  await expect(page.getByRole('heading', { name: 'Your trips', level: 2 })).toBeVisible();
  const card = page.locator('.trip-card', { hasText: 'In conversation' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Untitled Trip')).toHaveCount(0);
});

test('trip card renders exactly one primary affordance ("Open trip →"), regardless of stage', async ({ page }) => {
  const active = tripRecord({ id: 'e2e-trip-1', title: 'Coorg weekend', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } });
  await mockTripCommandFlow(page, [], { initialTrips: [active] });
  await page.goto('');
  const card = page.locator('.trip-card', { hasText: 'Coorg weekend' });
  await expect(card.getByRole('button', { name: 'Open trip →' })).toHaveCount(1);
  await expect(card.getByRole('button')).toHaveCount(2); // "Open trip →" + "Rename" only
});

test('a fresh trip with no traveler context does not clutter Dashboard-home', async ({ page }) => {
  const empty = tripRecord({ trip_state: {} });
  await mockTripCommandFlow(page, [], { initialTrips: [empty] });
  await page.goto('');
  // Malformed/empty trip_state fails closed to Dashboard-home's empty state
  // rather than crashing or showing a phantom card.
  await expect(page.getByText('No trips yet')).toBeVisible();

  await page.goto('my-trips');
  await expect(page.getByText('No trips yet')).toBeVisible();
});

// TWM-234: back-link visibility used to be keyed off which entry path
// (?intent=) started the conversation, not off whether a trip actually
// exists — so a fresh Discover entry never showed one, even after its first
// message created a real trip. It's now derived from trip state alone.
test('a fresh Discover entry shows the same back-link as an existing trip once it has one (TWM-234)', async ({ page }) => {
  await mockTripCommandFlow(page, [
    {
      entryIntent: 'discover',
      response: commandResponse('Where will you be travelling from?', tripRecord({
        version: 2,
        trip_state: {
          stage: 'new', active_agent: 'meridian',
          trip_context: { trip_duration: '7 days' },
          matcher_state: { conversation_context: { awaiting: 'origin_city' } },
        },
      })),
    },
  ]);

  await page.goto('');
  await page.getByText('Discover Destination', { exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Back to your trips' })).toHaveCount(0);

  await page.getByPlaceholder('Message Scout…').fill('Somewhere relaxing for a week');
  await page.getByLabel('Send').click();
  await expect(page.getByText('Where will you be travelling from?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to your trips' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Back to your trips' })).toBeVisible();
});
