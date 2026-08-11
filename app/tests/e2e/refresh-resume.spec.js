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
      trip_context: { original_traveler_request: 'exact golden request' },
      planner_state: { guide_session: { revision: 2, state: {
        phase: 'DAY_PLAN_DRAFT', destinations: ['Madhya Pradesh'], duration_days: 14, start_date: null,
        places: ['Gwalior Fort'], day_plan: [{ day_number: 1, date: null, places: ['Gwalior Fort'] }],
        preferences: [], exclusions: [], applied_changes: [], pending_clarification: null,
      } } },
    },
  });
  const afterRemoval = tripRecord({
    version: 3,
    trip_state: {
      ...initialTrip.trip_state,
      planner_state: { guide_session: { revision: 3, state: {
        ...initialTrip.trip_state.planner_state.guide_session.state,
        places: [], day_plan: [{ day_number: 1, date: null, places: [] }],
      } } },
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

  await expect(page.getByText('Duration-only · Day 1–14')).toBeVisible();
  await expect(page.getByText('Gwalior Fort')).not.toBeVisible();
});
