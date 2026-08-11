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
export async function mockTripCommandFlow(page, steps) {
  let pending = [...steps];
  await page.route('**/api/trips**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && /\/api\/trips\/?$/.test(pathname)) {
      return route.fulfill({ json: { trips: [] } });
    }
    if (method === 'POST' && /\/api\/trips\/?$/.test(pathname)) {
      return route.fulfill({ status: 201, json: tripRecord() });
    }
    if (method === 'POST' && pathname.endsWith('/commands')) {
      const body = request.postDataJSON();
      const step = pending.shift();
      if (!step) throw new Error(`Unexpected trip command: ${JSON.stringify(body)} (no more scripted steps).`);
      if (step.command !== body.command) {
        throw new Error(`Expected command "${step.command}" but got "${body.command}".`);
      }
      return route.fulfill({ json: step.response });
    }
    return route.continue();
  });
}

export { TRIP_ID, tripRecord, commandResponse };
