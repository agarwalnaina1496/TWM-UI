// TWM-110: JourneyEntry/ScoutChat now call the real POST /api/trips/{id}/commands
// boundary instead of a client-side fixture. Mocks that boundary with Playwright
// route interception so the exact scripted conversations stay deterministic and
// don't require a live Backend/agent deployment.
const TRIP_ID = 'e2e-trip-1';

function tripRecord({ id = TRIP_ID, version = 1, trip_state = {}, title = 'Untitled Trip', updated_at = '2026-01-01T00:00:00.000Z' } = {}) {
  return {
    id, title, product_mode: 'self_led', version,
    trip_state, ui_state: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at,
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
//
// `initialTrips` (TWM-108), when given instead, seeds the list with several
// distinct trip records — for adaptive-landing/My Trips specs. GET-list, GET
// single-by-id, and rename PATCH all resolve against the full seeded set; the
// scripted `steps` (commands) still apply to whichever trip id they're sent to.
//
// `initialRecommendation` / a step's `recommendation` field (TWM-153): the
// latest matcher round is served from GET /api/trips/{id}/recommendations,
// not from trip_state — set it once via the option, or update it from a
// scripted step whose command produced a new round (continue/traveler_message
// /discover_entry/more_like_this), 404 otherwise.
//
// `initialItineraryVersions` / a step's `itineraryVersions` field (TWM-155):
// archived itinerary revisions are served from
// GET /api/trips/{id}/itinerary-versions, not from trip_state — defaults to
// an empty list so any spec reaching the Dashboard doesn't need to opt in.
export async function mockTripCommandFlow(page, steps, { initialTrip, initialTrips, initialRecommendation = null, initialItineraryVersions = [] } = {}) {
  let pending = [...steps];
  const seeded = initialTrips ?? (initialTrip ? [initialTrip] : []);
  const records = new Map(seeded.map(record => [record.id, record]));
  let current = seeded[0] ?? null;
  let latestRecommendation = initialRecommendation;
  let itineraryVersions = initialItineraryVersions;
  await page.route('**/api/trips**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && /\/api\/trips\/?$/.test(pathname)) {
      const list = [...records.values()].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      return route.fulfill({ json: { trips: list } });
    }
    const recoMatch = method === 'GET' && pathname.match(/\/api\/trips\/([^/]+)\/recommendations$/);
    if (recoMatch) {
      if (!latestRecommendation) return route.fulfill({ status: 404, json: { detail: 'No recommendations yet.' } });
      return route.fulfill({ json: latestRecommendation });
    }
    const itineraryVersionsMatch = method === 'GET' && pathname.match(/\/api\/trips\/([^/]+)\/itinerary-versions$/);
    if (itineraryVersionsMatch) {
      return route.fulfill({ json: { versions: itineraryVersions } });
    }
    const singleMatch = method === 'GET' && pathname.match(/\/api\/trips\/([^/]+)$/);
    if (singleMatch && records.has(singleMatch[1])) {
      return route.fulfill({ json: records.get(singleMatch[1]) });
    }
    if (method === 'POST' && /\/api\/trips\/?$/.test(pathname)) {
      current = tripRecord({ id: seeded.length ? `${TRIP_ID}-${records.size + 1}` : undefined });
      records.set(current.id, current);
      return route.fulfill({ status: 201, json: current });
    }
    const renameMatch = method === 'PATCH' && pathname.match(/\/api\/trips\/([^/]+)$/);
    if (renameMatch && records.has(renameMatch[1])) {
      const body = request.postDataJSON();
      const updated = { ...records.get(renameMatch[1]), title: body.title, version: body.expected_version + 1 };
      records.set(renameMatch[1], updated);
      return route.fulfill({ json: updated });
    }
    if (method === 'POST' && pathname.endsWith('/commands')) {
      const body = request.postDataJSON();
      const step = pending.shift();
      if (!step) throw new Error(`Unexpected trip command: ${JSON.stringify(body)} (no more scripted steps).`);
      if (step.command !== body.command) {
        throw new Error(`Expected command "${step.command}" but got "${body.command}".`);
      }
      current = step.response.trip;
      records.set(current.id, current);
      if (step.recommendation !== undefined) latestRecommendation = step.recommendation;
      if (step.itineraryVersions !== undefined) itineraryVersions = step.itineraryVersions;
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
// proposed_revision, not the flat TWM-96 shape. Accepted-revision history
// (TWM-155) lives in its own table now, served via `itineraryVersions`/
// `initialItineraryVersions` on mockTripCommandFlow, not on this object.
function readyItineraryState(options) {
  return {
    status: 'ready',
    current_version: { version: 1, source_guide_revision: 3, result: atlasResult(options) },
    proposed_revision: null,
  };
}

export { TRIP_ID, tripRecord, commandResponse, atlasResult, readyItineraryState };
