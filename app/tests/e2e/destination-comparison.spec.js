import { test, expect } from '@playwright/test';
import { commandResponse, mockTripCommandFlow, tripRecord } from './testUtils.js';

const RECOMMENDED_MESSAGE = 'Madhya Pradesh is the strongest overall match.';

function successOutcome(overrides = {}) {
  return {
    status: 'SUCCESS',
    message: RECOMMENDED_MESSAGE,
    trip_type: 'circuit',
    traveler_criteria: [
      { id: 'budget', label: '₹1,00,000 total for two from Delhi', requirement_type: 'HARD', source_context_paths: ['budget'] },
      { id: 'pace', label: 'Easygoing balance of exploring and relaxing', requirement_type: 'PREFERENCE', source_context_paths: ['traveler_style'] },
    ],
    options: [{
      rank: 1, type: 'circuit', name: 'Madhya Pradesh Heritage and Nature', circuit_id: 'gwalior-orchha-khajuraho-panna',
      summary: 'The strongest balance of connectivity and pace.',
      evaluations: [
        {
          criterion_id: 'budget', outcome: 'TRADEOFF', conclusion: 'Close to budget with a small buffer.',
          details: [{ type: 'bullets', items: ['Round trip and stay leave a useful buffer.'] }],
          tradeoffs: ['A late add-on activity could push the total slightly higher.'],
        },
        {
          criterion_id: 'pace', outcome: 'MATCH', conclusion: 'Multi-night bases avoid a checklist itinerary.',
          details: [{ type: 'bullets', items: ['No daily hotel changes'] }],
        },
      ],
      other_considerations: [],
    }],
    ...overrides,
  };
}

function recommendedTripState(extra = {}) {
  return {
    stage: 'recommended', active_agent: null,
    trip_context: { origin: 'Delhi', budget: '₹1,00,000 total for both', travelers: 2 },
    matcher_state: { conversation_context: { last_meridian_message: null, awaiting: null } },
    ...extra,
  };
}

test('loads real recommendations via the continue command, shows a disclosed trade-off, and plans the trip through select_destination', async ({ page }) => {
  await mockTripCommandFlow(page, [
    { command: 'continue', response: commandResponse(null, tripRecord({ version: 2, trip_state: recommendedTripState() })), recommendation: successOutcome() },
    { command: 'select_destination', response: commandResponse('Madhya Pradesh Heritage and Nature is confirmed.', tripRecord({ version: 3, trip_state: recommendedTripState() })) },
    // TWM-106: landing on the Plan Builder immediately bootstraps a real
    // Guide session — scripted so the route mock doesn't reject it.
    {
      // Single-step generation: start_planning returns the complete plan
      // (places + day_plan together) once trip context is complete — no
      // separate approve_places step.
      command: 'start_planning',
      response: commandResponse('Here is your plan.', tripRecord({
        version: 4,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          trip_context: { destinations: ['Madhya Pradesh'], trip_duration: 1 },
          planner_state: {
            conversation_context: { awaiting: null },
            places: ['Gwalior Fort'],
            day_plan: [{ day_number: 1, date: null, places: ['Gwalior Fort'], pace: 'relaxed', buffer_note: null }],
            revision: 1,
          },
        },
      })),
    },
  ], {
    // TWM-189: a trip is never created out of thin air any more — this spec
    // jumps straight to /destinations (skipping the entry flow), so it must
    // seed an already-existing, pre-continue trip for that page's own
    // sendTripCommand('continue') to act on.
    initialTrip: tripRecord({ version: 1, trip_state: { stage: 'matching', active_agent: 'meridian', trip_context: { origin: 'Delhi', budget: '₹1,00,000 total for both', travelers: 2 } } }),
  });

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  await page.goto('destinations?next=preview');
  await expect(page.getByText('A few that fit well')).toBeVisible();

  await expect(page.locator('.matrix-wrap').getByText('Multi-stop circuit')).toBeVisible();
  await expect(page.locator('.matrix-wrap').getByText(/⚠/)).toBeVisible();

  const detailCard = page.locator('.dest-detail-card');
  await detailCard.getByText('See why this fits').click();
  await expect(detailCard.getByText(/A late add-on activity could push the total slightly higher\./)).toBeVisible();

  await detailCard.getByText('Plan this trip →').click();
  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await expect(page.getByText('Gwalior Fort')).toBeVisible();
});

test('More like this refreshes recommendations through the real command without committing selection', async ({ page }) => {
  await mockTripCommandFlow(page, [
    { command: 'continue', response: commandResponse(null, tripRecord({ version: 2, trip_state: recommendedTripState() })), recommendation: successOutcome() },
    {
      command: 'more_like_this',
      response: commandResponse(
        'Refreshed around Madhya Pradesh Heritage and Nature, while keeping your existing preferences.',
        tripRecord({ version: 3, trip_state: recommendedTripState() })
      ),
      recommendation: successOutcome({ message: 'Refreshed around Madhya Pradesh Heritage and Nature, while keeping your existing preferences.' }),
    },
  ], {
    // TWM-189: see the comment in the previous test — a pre-continue trip
    // must be seeded since this spec never runs the entry flow.
    initialTrip: tripRecord({ version: 1, trip_state: { stage: 'matching', active_agent: 'meridian', trip_context: { origin: 'Delhi', budget: '₹1,00,000 total for both', travelers: 2 } } }),
  });

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('destinations?next=preview');
  await expect(page.getByText('A few that fit well')).toBeVisible();

  const detailCard = page.locator('.dest-detail-card');
  await detailCard.getByRole('button', { name: 'More like this' }).click();
  await expect(page.getByText(/Refreshed around Madhya Pradesh Heritage and Nature/)).toBeVisible();
  // Refreshing recommendations must not itself commit a selection — staying
  // on /destinations (never routed to /trip-preview) proves that.
  await expect(page).toHaveURL(/\/app\/destinations/);
});
