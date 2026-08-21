import { test, expect } from '@playwright/test';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

// TWM-106: the Plan Builder is now driven by the real Backend-owned Guide
// trip-command lifecycle. TripContext always re-fetches the trip from the
// Backend on mount (never trusts cached localStorage alone), so refresh/resume
// is verified against the mocked GET /api/trips[/id] persistence, not a
// client-side mock revision stack.
test('Plan Builder edit survives refresh via the real Guide trip-command state', async ({ page }) => {
  const initialTrip = tripRecord({
    version: 2,
    trip_state: {
      stage: 'planning', active_agent: 'guide',
      trip_context: { original_traveler_request: 'exact golden request', destinations: ['Madhya Pradesh'], trip_duration: 14 },
      planner_state: {
        conversation_context: { awaiting: null },
        places: ['Gwalior Fort'],
        day_plan: [{ day_number: 1, date: null, places: ['Gwalior Fort'], pace: 'relaxed', buffer_note: null }],
        revision: 2,
      },
    },
  });
  const afterRemoval = tripRecord({
    version: 3,
    trip_state: {
      ...initialTrip.trip_state,
      planner_state: {
        ...initialTrip.trip_state.planner_state,
        places: [],
        day_plan: [{ day_number: 1, date: null, places: [], pace: 'relaxed', buffer_note: null }],
        revision: 3,
      },
    },
  });

  await mockTripCommandFlow(
    page,
    [{ command: 'traveler_message', response: commandResponse('Guide revised the plan.', afterRemoval) }],
    { initialTrip },
  );

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('trip-preview');

  await expect(page.getByText('Gwalior Fort')).toBeVisible();
  await page.getByRole('button', { name: 'Remove Gwalior Fort' }).click();
  await expect(page.getByText('Gwalior Fort')).not.toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { name: /Madhya Pradesh/ })).toBeVisible();
  await expect(page.getByText('Gwalior Fort')).not.toBeVisible();
});

// TWM-173: refreshing mid-Discover-conversation must not reset the chat to
// Scout's cold-open greeting, even though no chat transcript is persisted
// (TripState has no messages/chat_log field) — a recap turn built from the
// already-saved trip_context stands in for it instead.
test('refreshing mid-Discover-conversation shows a recap turn, not the cold-open greeting', async ({ page }) => {
  const trip = tripRecord({
    version: 2,
    trip_state: {
      stage: 'matching', active_agent: 'meridian',
      trip_context: { origin_city: 'Delhi', num_travelers: 2 },
      matcher_state: { conversation_context: { last_meridian_message: null, awaiting: null } },
    },
  });

  await mockTripCommandFlow(page, [], { initialTrip: trip });

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('scout-chat');

  await expect(page.getByText(/Picking up where you left off/)).toBeVisible();
  await expect(page.getByText(/From Delhi/)).toBeVisible();
  await expect(page.getByText(/Hey there! I'm Scout/)).not.toBeVisible();

  await page.reload();

  await expect(page.getByText(/Picking up where you left off/)).toBeVisible();
  await expect(page.getByText(/Hey there! I'm Scout/)).not.toBeVisible();
});
