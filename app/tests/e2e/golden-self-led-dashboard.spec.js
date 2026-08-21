import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';
import { commandResponse, mockTripCommandFlow, readyItineraryState, tripRecord } from './testUtils.js';

// TWM-104 wired Destinations.jsx to real trip commands: it now sends a
// `continue` command on entry when no recommendation is saved yet, and reads
// the result from GET /api/trips/{id}/recommendations (TWM-153).
test('advice journey reaches destination match, Choose Plan and Self-Led Dashboard', async ({ page }) => {
  await mockTripCommandFlow(page, [
    {
      // A real discover_entry response always carries at least the
      // traveler's original request in trip_context (Scout extracts what it
      // can from the very first turn) — a trip_context-less "new" trip
      // reads as an empty/orphan trip and (TWM-190) now routes straight
      // through ScoutChat's own deep-link empty-trip guard, which would
      // otherwise bounce this fixture home before Delhi's quick-reply chip
      // ever renders.
      command: 'discover_entry',
      response: commandResponse('Where will you be travelling from?', tripRecord({
        version: 2,
        trip_state: {
          stage: 'new', active_agent: 'scout',
          trip_context: { original_traveler_request: GOLDEN_QUERY },
          matcher_state: { conversation_context: { awaiting: 'origin_city' } },
        },
      })),
    },
    {
      // Still stage: 'new' — must keep carrying trip_context for the same
      // reason as the discover_entry step above, or the empty-trip guard
      // fires again on this very turn.
      command: 'traveler_message',
      response: commandResponse('And roughly what total budget would you like to stay within?', tripRecord({
        version: 3,
        trip_state: {
          stage: 'new', active_agent: 'scout',
          trip_context: { original_traveler_request: GOLDEN_QUERY },
          matcher_state: { conversation_context: { awaiting: 'budget' } },
        },
      })),
    },
    {
      command: 'traveler_message',
      response: commandResponse('I’ll look for a comfortable 14-day trip within budget.', tripRecord({
        version: 4,
        trip_state: { stage: 'recommended', active_agent: 'meridian', matcher_state: { conversation_context: { awaiting: null } } },
      })),
    },
    {
      command: 'continue',
      response: commandResponse(null, tripRecord({
        version: 5,
        trip_state: {
          stage: 'recommended', active_agent: null,
          matcher_state: { conversation_context: { awaiting: null } },
        },
      })),
      recommendation: {
        status: 'SUCCESS', message: 'Coorg is a comfortable fit within budget.', trip_type: 'single',
        traveler_criteria: [{ id: 'budget', label: '₹1,00,000 total for both', requirement_type: 'HARD', source_context_paths: ['budget'] }],
        options: [{
          rank: 1, type: 'single', name: 'Coorg', destination_id: 'coorg', summary: 'A comfortable fit within budget.',
          evaluations: [{ criterion_id: 'budget', outcome: 'MATCH', conclusion: 'Fits within budget.', details: [{ type: 'bullets', items: ['Estimated total stays within budget.'] }] }],
          other_considerations: [],
        }],
      },
    },
    {
      command: 'select_destination',
      response: commandResponse('Coorg is confirmed.', tripRecord({ version: 6, trip_state: { stage: 'matched', active_agent: null } })),
    },
    {
      // Single-step generation: start_planning returns the complete plan
      // (places + day_plan together) once trip context is complete — no
      // separate approve_places step.
      command: 'start_planning',
      response: commandResponse('Here is your plan.', tripRecord({
        version: 7,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          trip_context: { destinations: ['Coorg'], trip_duration: 1 },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Abbey Falls'],
            day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null }],
            revision: 1,
          },
        },
      })),
    },
    {
      command: 'approve_plan',
      response: commandResponse('Plan approved.', tripRecord({
        version: 8,
        trip_state: {
          stage: 'planned', active_agent: null,
          trip_context: { destinations: ['Coorg'], trip_duration: 1 },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Abbey Falls'],
            day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null }],
            revision: 2,
            frozen_plan: { guide_revision: 2, guide_state: {} },
          },
        },
      })),
    },
    {
      command: 'start_itinerary',
      response: commandResponse(null, tripRecord({
        version: 9,
        trip_state: {
          stage: 'planned', active_agent: null,
          trip_context: { destinations: ['Coorg'], trip_duration: 1 },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Abbey Falls'],
            day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null }],
            revision: 2,
            frozen_plan: { guide_revision: 2, guide_state: {} },
          },
          itinerary_state: readyItineraryState(),
        },
      })),
    },
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.getByText('Discover Destination').click();
  await expect(page).toHaveURL(/\/app\/journey-entry/);
  await page.getByPlaceholder('Tell Scout about your trip…').fill(GOLDEN_QUERY);
  await page.getByLabel('Send').click();
  // TWM-190: JourneyEntry only sends the first message and redirects to
  // ScoutChat — the rest of the conversation happens there, not inline.
  await expect(page).toHaveURL(/\/app\/scout-chat/);
  await page.getByRole('button', { name: 'Delhi' }).click();
  await page.getByRole('button', { name: '₹1,00,000 total for both' }).click();
  await page.getByRole('button', { name: 'See destinations →' }).click();

  await expect(page).toHaveURL(/\/app\/destinations/);
  await expect(page.getByText('A few that fit well')).toBeVisible();
  await page.getByText('Plan this trip →').first().click();

  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await expect(page.getByText('Abbey Falls')).toBeVisible();
  await page.getByText('Approve this plan →').click();

  // TWM-140: no Choose Plan interstitial — approve_plan navigates straight in.
  // TWM-97: the Dashboard itself triggers start_itinerary and renders the real result.
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole('button', { name: /Overview/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Abbey Falls Getaway')).toBeVisible();
});
