// Shared helpers for seeding TripContext's localStorage-backed state in e2e tests.
export const STORAGE_KEY = 'twm_prototype_state_v1';

export async function seedState(page, { trip = {}, auth, savedTrips = [] }) {
  // Land on an in-app page first so localStorage is set on the app's own origin/path.
  await page.goto('login');
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: { trip, auth, savedTrips } }
  );
}

// TWM-110: JourneyEntry/ScoutChat now call the real POST /api/trips/{id}/commands
// boundary instead of a client-side fixture. Mocks that boundary with Playwright
// route interception so the exact scripted conversations stay deterministic and
// don't require a live Backend/agent deployment.
const TRIP_ID = 'e2e-trip-1';

function tripRecord({ version = 1, trip_state = {} } = {}) {
  return {
    id: TRIP_ID, title: 'Untitled Trip', product_mode: 'self_led', version,
    trip_state, ui_state: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function commandResponse(message, trip) {
  return { message, agent_meta: null, trip };
}

// `steps` is an ordered array of { command, response } — response is a
// {message, trip} pair built with commandResponse/tripRecord. Each command
// sent by the app is matched to the next step in order; command name is
// asserted so a mis-sequenced test fails loudly instead of silently mismatching.
//
// `initialTrip`, when given, makes GET /api/trips (list) and GET /api/trips/{id}
// (single) serve a persisted trip record instead of the default "no trips yet"
// behavior — needed for refresh/resume specs, since TripContext always re-fetches
// from the Backend on mount rather than trusting cached localStorage state.
export async function mockTripCommandFlow(page, steps, { initialTrip } = {}) {
  let pending = [...steps];
  let current = initialTrip ?? null;
  await page.route('**/api/trips**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && /\/api\/trips\/?$/.test(pathname)) {
      return route.fulfill({ json: { trips: current ? [current] : [] } });
    }
    if (method === 'GET' && current && pathname.endsWith(`/${current.id}`)) {
      return route.fulfill({ json: current });
    }
    if (method === 'POST' && /\/api\/trips\/?$/.test(pathname)) {
      current = tripRecord();
      return route.fulfill({ status: 201, json: current });
    }
    if (method === 'POST' && pathname.endsWith('/commands')) {
      const body = request.postDataJSON();
      const step = pending.shift();
      if (!step) throw new Error(`Unexpected trip command: ${JSON.stringify(body)} (no more scripted steps).`);
      if (step.command !== body.command) {
        throw new Error(`Expected command "${step.command}" but got "${body.command}".`);
      }
      current = step.response.trip;
      return route.fulfill({ json: step.response });
    }
    return route.continue();
  });
}

// A minimal, schema-valid AtlasResponse (twm/schemas/atlas.py) for e2e specs
// that just need to reach the Dashboard and see real content render.
function atlasResult({ title = 'Abbey Falls Getaway', destination = 'Coorg', primaryLocation = 'Coorg' } = {}) {
  const reference = { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null };
  return {
    final_itinerary: {
      trip_summary: {
        title, destinations: [destination], duration_days: 1, travelers: 2,
        date_range: null, overview: 'A relaxed one-day visit.', route_rationale: 'Everything is within one base.',
      },
      travel_options: [],
      stay_options: [],
      days: [{
        day_number: 1, date: null, title: 'Arrival and exploring', primary_location: primaryLocation,
        summary: 'An easy first day.',
        timeline: [{
          start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Abbey Falls', location: primaryLocation,
          detail: 'Visit at a relaxed pace.', movement_guidance: null, estimated_cost_low: 0, estimated_cost_high: 0,
          reference, requires_advance_booking: false, booking_readiness: null,
        }],
        seasonal_guidance: 'Carry layers.', permit_or_ticket_guidance: 'None required.', backup_plan: null,
      }],
      budget_summary: { currency: 'INR', lines: [{ category: 'Local movement', amount_low: 500, amount_high: 800, note: 'General range.' }], total_low: 500, total_high: 800, budget_fit: 'Within a typical budget.' },
      practical_notes: [],
      sources: [],
      assumptions: [],
    },
    unresolved: [],
    agent_meta: { agent: 'atlas', prompt_version: '1.2.0' },
  };
}

// TWM-138: itinerary_state.result nests under current_version alongside
// history/proposed_revision, not the flat TWM-96 shape.
function readyItineraryState(options) {
  return {
    status: 'ready',
    current_version: { version: 1, source_guide_revision: 3, result: atlasResult(options) },
    history: [],
    proposed_revision: null,
  };
}

export { TRIP_ID, tripRecord, commandResponse, atlasResult, readyItineraryState };
