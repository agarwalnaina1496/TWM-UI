import { test, expect } from '@playwright/test';
import { GOLDEN_QUERY } from '../../src/data/entryCommandFixtures.js';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

// TWM-176: Dashboard Bookings tab replaces the standalone /logistics route
// with inline resolve for Transport/Stay/Activity. This spec exercises a
// two-stop trip (so a real transport leg exists) with one Atlas-flagged
// requires_advance_booking activity, and the trip-independent Support link.
function twoStopAtlasResult() {
  const reference = { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null };
  return {
    final_itinerary: {
      trip_summary: {
        title: 'Coorg & Wayanad Loop', destinations: ['Coorg', 'Wayanad'], duration_days: 2, travelers: 2,
        date_range: null, overview: 'Two bases, one loop.', route_rationale: 'Coorg first, then Wayanad.',
      },
      days: [
        {
          day_number: 1, date: null, title: 'Coorg base', primary_location: 'Coorg',
          summary: 'Settle into Coorg.',
          timeline: [{
            start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Abbey Falls', location: 'Coorg',
            detail: 'Visit at a relaxed pace.', movement_guidance: null, estimated_cost_low: 0, estimated_cost_high: 0,
            reference, requires_advance_booking: false, booking_readiness: null,
          }],
          seasonal_guidance: 'Carry layers.', permit_or_ticket_guidance: 'None required.', backup_plan: null,
        },
        {
          day_number: 2, date: null, title: 'Wayanad wildlife', primary_location: 'Wayanad',
          summary: 'Move to Wayanad for a guided safari.',
          timeline: [{
            start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Wildlife safari', location: 'Wayanad',
            detail: 'Limited daily slots — advance booking required.', movement_guidance: null,
            estimated_cost_low: 1500, estimated_cost_high: 2500,
            reference, requires_advance_booking: true, booking_readiness: null,
          }],
          seasonal_guidance: 'Carry layers.', permit_or_ticket_guidance: 'Forest permit required.', backup_plan: null,
        },
      ],
      budget_summary: { currency: 'INR', lines: [{ category: 'Local movement', amount_low: 500, amount_high: 800, note: 'General range.' }], total_low: 500, total_high: 800, budget_fit: 'Within a typical budget.' },
      practical_notes: [],
      sources: [],
      assumptions: [],
    },
    unresolved: [],
    agent_meta: { agent: 'atlas', prompt_version: '1.2.0' },
  };
}

test('Bookings tab resolves a transport leg, surfaces the flagged Activity, and Support is reachable with no trip open', async ({ page }) => {
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
        trip_state: { stage: 'recommended', active_agent: null, matcher_state: { conversation_context: { awaiting: null } } },
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
      command: 'start_planning',
      response: commandResponse('Here is your plan.', tripRecord({
        version: 7,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          trip_context: { destinations: ['Coorg', 'Wayanad'], trip_duration: 2, origin: 'Delhi' },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Abbey Falls'],
            day_plan: [
              { day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null },
              { day_number: 2, date: null, places: ['Wildlife safari'], pace: 'relaxed', buffer_note: null },
            ],
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
          trip_context: { destinations: ['Coorg', 'Wayanad'], trip_duration: 2, origin: 'Delhi' },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Abbey Falls'],
            day_plan: [
              { day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null },
              { day_number: 2, date: null, places: ['Wildlife safari'], pace: 'relaxed', buffer_note: null },
            ],
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
          trip_context: { destinations: ['Coorg', 'Wayanad'], trip_duration: 2, origin: 'Delhi' },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Abbey Falls'],
            day_plan: [
              { day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null },
              { day_number: 2, date: null, places: ['Wildlife safari'], pace: 'relaxed', buffer_note: null },
            ],
            revision: 2,
            frozen_plan: { guide_revision: 2, guide_state: {} },
          },
          itinerary_state: {
            status: 'ready',
            current_version: { version: 1, source_guide_revision: 3, result: twoStopAtlasResult() },
            proposed_revision: null,
          },
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
  await page.getByText('Plan this trip →').first().click();

  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await page.getByText('Approve this plan →').click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
  // TWM-175: a one-time "itinerary ready" prompt covers the tab nav the
  // first time a trip's itinerary is generated — dismiss it first.
  await page.getByRole('button', { name: 'Take a look at the trip first' }).click();
  await page.getByRole('navigation', { name: 'Trip Dashboard tabs' }).getByRole('button', { name: 'Bookings' }).click();

  // Transport: the Delhi -> Coorg -> Wayanad -> Delhi route is a round trip
  // (returns to origin), so it bundles as one priced decision, not per-leg.
  await expect(page.getByText('🚗 Transport')).toBeVisible();
  const roundTripLabel = page.getByRole('heading', { name: /Delhi ⇄ Coorg round trip|Delhi ⇄ Wayanad round trip/ });
  await expect(roundTripLabel).toBeVisible();
  await page.getByRole('button', { name: /Resolve/ }).first().click();
  await expect(page.getByRole('link', { name: 'Check ↗' }).first()).toBeVisible();

  // Activity: only the Atlas-flagged Wayanad safari appears, framed as the exception.
  await expect(page.getByText(/the exception, not the norm/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Wildlife safari/ })).toBeVisible();
  await expect(page.getByText('Abbey Falls')).toHaveCount(0);

  // Support: no TWM-Led upsell language anywhere on the tab.
  await page.getByRole('button', { name: 'Support' }).click();
  await expect(page.getByText('Talk to the TravelWithMe team')).toBeVisible();
  await expect(page.getByText('Get booking help')).toHaveCount(0);
});

test('Support is reachable from Home with zero trips in progress', async ({ page }) => {
  await mockTripCommandFlow(page, []);
  await page.goto('');
  await expect(page.getByText('No trips yet')).toBeVisible();
  await page.getByRole('link', { name: 'Support' }).click();
  await expect(page).toHaveURL(/\/support/);
  await expect(page.getByText('Talk to the TravelWithMe team')).toBeVisible();
  await expect(page.getByText('Get booking help')).toHaveCount(0);
});
