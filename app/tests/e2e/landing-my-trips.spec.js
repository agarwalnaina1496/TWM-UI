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
  // TWM-232/TWM-234: `active` (stage "matching") is still Discovering -- its
  // heading is its stored title, and it says the destination is still open;
  // `upcoming` is a real trip with its itinerary-ready badge.
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
  await expect(page.getByText('Coorg weekend')).toBeVisible();
  await expect(page.getByText('Destination not chosen yet')).toBeVisible();
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

test('a discovering trip with no title yet shows a "New discovery" heading, not the placeholder (TWM-234)', async ({ page }) => {
  // A trip with no destination committed isn't "a trip" to the traveler yet
  // -- it lives in its own Discovering section. With nothing identifying
  // known, its heading is "New discovery"; the placeholder title is never
  // shown, Rename is always available, and the destination is marked open.
  const browsing = tripRecord({
    id: 'e2e-trip-1', title: 'Untitled Trip',
    trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [browsing] });
  await page.goto('');

  await expect(page.getByRole('heading', { name: 'Discovering', level: 2 })).toBeVisible();
  const card = page.locator('.trip-card-discovering');
  await expect(card.getByText('New discovery')).toBeVisible();
  await expect(card.getByText('Untitled Trip')).toHaveCount(0);
  await expect(card.getByText('Destination not chosen yet')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Rename' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Continue exploring →' })).toBeVisible();
});

test('matched card offers two next steps; a planning card opens the trip (TWM-234)', async ({ page }) => {
  const matched = tripRecord({
    id: 'e2e-trip-1', title: 'Coorg weekend',
    trip_state: { stage: 'matched', trip_context: { origin: 'Delhi', destinations: ['Coorg'] } },
  });
  const planning = tripRecord({ id: 'e2e-trip-2', title: 'Manali plan', trip_state: { stage: 'planning', trip_context: { origin: 'Delhi' } }, updated_at: '2025-12-01T00:00:00.000Z' });
  await mockTripCommandFlow(page, [], { initialTrips: [matched, planning] });
  await page.goto('');

  // Matched: the traveler's own title, the chosen destination as its own
  // line, plan it or look for a different one.
  const matchedCard = page.locator('.trip-card', { hasText: 'Coorg weekend' });
  await expect(matchedCard.getByText('Coorg', { exact: true })).toBeVisible();
  await expect(matchedCard.getByRole('button', { name: 'Plan this trip →' })).toHaveCount(1);
  await expect(matchedCard.getByRole('button', { name: 'Want a different destination?' })).toHaveCount(1);
  await expect(matchedCard.getByRole('button', { name: 'Rename' })).toHaveCount(1);

  const planningCard = page.locator('.trip-card', { hasText: 'Manali plan' });
  await expect(planningCard.getByRole('button', { name: 'Continue planning →' })).toHaveCount(1);
  await expect(planningCard.getByRole('button')).toHaveCount(2); // "Continue planning →" + "Rename" only
});

test('matched card keeps its Meridian title and shows the chosen destination on its own line (TWM-234)', async ({ page }) => {
  const matched = tripRecord({
    id: 'e2e-trip-1', title: '5 Day Getaway from Delhi', title_source: 'generated',
    trip_state: { stage: 'matched', trip_context: { origin: 'Delhi', destinations: ['Coorg'] } },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [matched] });
  await page.goto('');

  const card = page.locator('.trip-card-discovering');
  await expect(card.getByText('5 Day Getaway from Delhi')).toBeVisible();
  await expect(card.getByText('Coorg', { exact: true })).toBeVisible();
  await expect(card.getByText('Destination not chosen yet')).toHaveCount(0);

  await card.getByRole('button', { name: 'Rename' }).click();
  await page.locator('input.name').fill('Family trip');
  await page.keyboard.press('Enter');
  await expect(card.getByText('Family trip')).toBeVisible();
});

test('"Plan this trip" on a matched card starts planning and opens the Dashboard (TWM-234)', async ({ page }) => {
  const matched = tripRecord({
    id: 'e2e-trip-1', title: 'Coorg weekend',
    trip_state: { stage: 'matched', trip_context: { origin: 'Delhi', destinations: ['Coorg'] } },
  });
  await mockTripCommandFlow(page, [
    {
      command: 'start_planning',
      response: commandResponse('Which dates work for you?', tripRecord({
        id: 'e2e-trip-1', title: 'Coorg weekend', version: 2,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          trip_context: { origin: 'Delhi', destinations: ['Coorg'] },
          planner_state: { conversation_context: { awaiting: 'travel_dates' }, places: [], day_plan: [], revision: 1 },
        },
      })),
    },
  ], { initialTrips: [matched] });
  await page.goto('');

  await page.getByRole('button', { name: 'Plan this trip →' }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByText('Planning your trip')).toBeVisible();
});

test('a matched trip opens to its chosen destination with Plan / Compare, never a blank Overview (TWM-234)', async ({ page }) => {
  const matched = tripRecord({
    id: 'e2e-trip-1', title: 'Coorg weekend',
    trip_state: {
      stage: 'matched', trip_context: { origin: 'Delhi', destinations: ['Coorg'] },
      selected_option: { type: 'single', id: 'coorg', name: 'Coorg' },
    },
  });
  await mockTripCommandFlow(page, [], { initialTrips: [matched] });
  await page.goto('dashboard?tripId=e2e-trip-1');

  await expect(page.getByText('Discovering a destination')).toBeVisible();
  await expect(page.getByText('Your pick')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan this trip →' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare other destinations' })).toBeVisible();
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
