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
