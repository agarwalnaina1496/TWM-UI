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
      command: 'start_planning',
      response: commandResponse('Here are the places I suggest.', tripRecord({
        version: 4,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          planner_state: { guide_session: { revision: 1, state: {
            phase: 'PLACES_DRAFT', destinations: ['Madhya Pradesh'], duration_days: null, start_date: null,
            places: ['Gwalior Fort'], day_plan: [], preferences: [], exclusions: [],
            applied_changes: [], pending_clarification: null,
          } } },
        },
      })),
    },
    {
      command: 'approve_places',
      response: commandResponse('Places approved; here is the day plan.', tripRecord({
        version: 5,
        trip_state: {
          stage: 'planning', active_agent: 'guide',
          planner_state: { guide_session: { revision: 2, state: {
            phase: 'DAY_PLAN_DRAFT', destinations: ['Madhya Pradesh'], duration_days: 1, start_date: null,
            places: ['Gwalior Fort'], day_plan: [{ day_number: 1, date: null, places: ['Gwalior Fort'] }],
            preferences: [], exclusions: [], applied_changes: [], pending_clarification: null,
          } } },
        },
      })),
    },
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  await page.goto('destinations?next=preview');
  await expect(page.getByText('A few that fit well')).toBeVisible();

  const circuitCard = page.locator('.dest-card', { hasText: 'Madhya Pradesh Heritage and Nature' });
  await expect(circuitCard.getByText('Multi-stop circuit')).toBeVisible();
  await expect(circuitCard.getByText(/⚠/)).toBeVisible();

  await circuitCard.getByText('Why this one').click();
  await expect(circuitCard.getByText(/A late add-on activity could push the total slightly higher\./)).toBeVisible();

  await circuitCard.getByText('Plan this trip →').click();
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
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('destinations?next=preview');
  await expect(page.getByText('A few that fit well')).toBeVisible();

  const circuitCard = page.locator('.dest-card', { hasText: 'Madhya Pradesh Heritage and Nature' });
  await circuitCard.getByRole('button', { name: 'More like this' }).click();
  await expect(page.getByText(/Refreshed around Madhya Pradesh Heritage and Nature/)).toBeVisible();
  // Refreshing recommendations must not itself commit a selection — staying
  // on /destinations (never routed to /trip-preview) proves that.
  await expect(page).toHaveURL(/\/app\/destinations/);
});
