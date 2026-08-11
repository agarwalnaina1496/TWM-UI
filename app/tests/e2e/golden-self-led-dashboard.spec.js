import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';
import { atlasResult, commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

// TWM-104 wired Destinations.jsx to real trip commands: it now sends a
// `continue` command on entry when no recommendation is saved yet, and reads
// the result from the real matcher_state.recommendations entry.
test('advice journey reaches destination match, Choose Plan and Self-Led Dashboard', async ({ page }) => {
  await mockTripCommandFlow(page, [
    {
      command: 'advice_entry',
      response: commandResponse('Where will you be travelling from?', tripRecord({
        version: 2,
        trip_state: { stage: 'new', active_agent: 'scout', matcher_state: { conversation_context: { awaiting: 'origin' } } },
      })),
    },
    {
      command: 'traveler_message',
      response: commandResponse('And roughly what total budget would you like to stay within?', tripRecord({
        version: 3,
        trip_state: { stage: 'new', active_agent: 'scout', matcher_state: { conversation_context: { awaiting: 'budget' } } },
      })),
    },
    {
      command: 'traveler_message',
      response: commandResponse('I’ll look for a comfortable 14-day trip within budget.', tripRecord({
        version: 4,
        trip_state: { stage: 'matching', active_agent: 'meridian' },
      })),
    },
    {
      command: 'continue',
      response: commandResponse(null, tripRecord({
        version: 5,
        trip_state: {
          stage: 'recommended', active_agent: null,
          matcher_state: {
            conversation_context: { awaiting: null },
            recommendations: [{
              status: 'SUCCESS', message: 'Coorg is a comfortable fit within budget.', trip_type: 'single',
              traveler_criteria: [{ id: 'budget', label: '₹1,00,000 total for both', requirement_type: 'HARD', source_context_paths: ['budget'] }],
              options: [{
                rank: 1, type: 'single', name: 'Coorg', destination_id: 'coorg', summary: 'A comfortable fit within budget.',
                evaluations: [{ criterion_id: 'budget', outcome: 'MATCH', conclusion: 'Fits within budget.', details: [{ type: 'bullets', items: ['Estimated total stays within budget.'] }] }],
                other_considerations: [],
              }],
            }],
          },
        },
      })),
    },
    {
      command: 'select_destination',
      response: commandResponse('Coorg is confirmed.', tripRecord({ version: 6, trip_state: { stage: 'matched', active_agent: null } })),
    },
    {
      command: 'start_planning',
      response: commandResponse('Here are the places I suggest.', tripRecord({
        version: 7,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          planner_state: { guide_session: { revision: 1, state: {
            phase: 'PLACES_DRAFT', destinations: ['Coorg'], duration_days: null, start_date: null,
            places: ['Abbey Falls'], day_plan: [], preferences: [], exclusions: [],
            applied_changes: [], pending_clarification: null,
          } } },
        },
      })),
    },
    {
      command: 'approve_places',
      response: commandResponse('Places approved; here is the day plan.', tripRecord({
        version: 8,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          planner_state: { guide_session: { revision: 2, state: {
            phase: 'DAY_PLAN_DRAFT', destinations: ['Coorg'], duration_days: 1, start_date: null,
            places: ['Abbey Falls'], day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'] }],
            preferences: [], exclusions: [], applied_changes: [], pending_clarification: null,
          } } },
        },
      })),
    },
    {
      command: 'approve_plan',
      response: commandResponse('Plan approved.', tripRecord({
        version: 9,
        trip_state: {
          stage: 'planned', active_agent: null,
          planner_state: {
            guide_session: { revision: 3, state: {
              phase: 'PLAN_APPROVED', destinations: ['Coorg'], duration_days: 1, start_date: null,
              places: ['Abbey Falls'], day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'] }],
              preferences: [], exclusions: [], applied_changes: [], pending_clarification: null,
            } },
            frozen_plan: { guide_revision: 3, guide_state: {
              phase: 'PLAN_APPROVED', destinations: ['Coorg'], duration_days: 1, start_date: null,
              places: ['Abbey Falls'], day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'] }],
              preferences: [], exclusions: [], applied_changes: [], pending_clarification: null,
            } },
          },
        },
      })),
    },
    {
      command: 'start_itinerary',
      response: commandResponse(null, tripRecord({
        version: 10,
        trip_state: {
          stage: 'planned', active_agent: null,
          planner_state: {
            guide_session: { revision: 3, state: { phase: 'PLAN_APPROVED' } },
            frozen_plan: { guide_revision: 3, guide_state: { phase: 'PLAN_APPROVED' } },
          },
          itinerary_state: { status: 'ready', version: 1, source_guide_revision: 3, result: atlasResult() },
        },
      })),
    },
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.getByPlaceholder(/Plan my Coorg trip/).fill(GOLDEN_QUERY);
  await page.getByLabel('Send').click();
  await page.getByRole('button', { name: 'Delhi' }).click();
  await page.getByRole('button', { name: '₹1,00,000 total for both' }).click();
  await page.getByRole('button', { name: /Continue to destination discovery/ }).click();

  await expect(page).toHaveURL(/\/app\/destinations/);
  await expect(page.getByText('A few that fit well')).toBeVisible();
  await page.getByText('Plan this trip →').first().click();

  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await expect(page.getByText('Abbey Falls')).toBeVisible();
  await page.getByText('Generate detailed itinerary →').click();

  // TWM-140: no Choose Plan interstitial — approve_plan navigates straight in.
  // TWM-97: the Dashboard itself triggers start_itinerary and renders the real result.
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole('button', { name: /Days/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Abbey Falls Getaway')).toBeVisible();
});
