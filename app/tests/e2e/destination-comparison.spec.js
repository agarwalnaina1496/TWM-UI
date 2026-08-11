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

function recommendedTripState(latest, extra = {}) {
  return {
    stage: 'recommended', active_agent: null,
    trip_context: { origin: 'Delhi', budget: '₹1,00,000 total for both', travelers: 2 },
    matcher_state: { conversation_context: { last_meridian_message: null, awaiting: null }, recommendations: [latest] },
    ...extra,
  };
}

test('loads real recommendations via the continue command, shows a disclosed trade-off, and plans the trip through select_destination', async ({ page }) => {
  await mockTripCommandFlow(page, [
    { command: 'continue', response: commandResponse(null, tripRecord({ version: 2, trip_state: recommendedTripState(successOutcome()) })) },
    { command: 'select_destination', response: commandResponse('Madhya Pradesh Heritage and Nature is confirmed.', tripRecord({ version: 3, trip_state: recommendedTripState(successOutcome()) })) },
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
});

test('More like this refreshes recommendations through the real command without committing selection', async ({ page }) => {
  await mockTripCommandFlow(page, [
    { command: 'continue', response: commandResponse(null, tripRecord({ version: 2, trip_state: recommendedTripState(successOutcome()) })) },
    {
      command: 'more_like_this',
      response: commandResponse(
        'Refreshed around Madhya Pradesh Heritage and Nature, while keeping your existing preferences.',
        tripRecord({ version: 3, trip_state: recommendedTripState(successOutcome({ message: 'Refreshed around Madhya Pradesh Heritage and Nature, while keeping your existing preferences.' })) })
      ),
    },
  ]);

  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('destinations?next=preview');
  await expect(page.getByText('A few that fit well')).toBeVisible();

  const circuitCard = page.locator('.dest-card', { hasText: 'Madhya Pradesh Heritage and Nature' });
  await circuitCard.getByRole('button', { name: 'More like this' }).click();
  await expect(page.getByText(/Refreshed around Madhya Pradesh Heritage and Nature/)).toBeVisible();
  await expect(page).toHaveURL(/\/app\/destinations/);

  const destinationBeforePlan = await page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')).trip.destination);
  expect(destinationBeforePlan).toBeNull();
});
