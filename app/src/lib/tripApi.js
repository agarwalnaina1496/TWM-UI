const TRIPS_PATH = '/api/trips';

export class TripApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = 'TripApiError';
    this.status = status;
    this.payload = payload;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Matches the Backend's own upper bound on a single agent invocation
// (~185s n8n timeout) plus headroom, so a hung upstream call surfaces as a
// rejected request instead of leaving the UI (and queueTripMutation's
// per-trip chain) stuck indefinitely.
const REQUEST_TIMEOUT_MS = 200_000;

async function request(path = '', options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${TRIPS_PATH}${path}`, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
    });
  } catch (fetchError) {
    if (fetchError.name === 'AbortError') {
      throw new TripApiError('The request timed out. Please try again.', { status: 0 });
    }
    throw new TripApiError(fetchError.message || 'Trip persistence request failed.', { status: 0 });
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new TripApiError(payload?.detail?.message || payload?.detail || 'Trip persistence request failed.', {
      status: response.status,
      payload,
    });
  }
  return payload;
}

// A freshly created trip has no meaningful trip_state yet — mirrors
// index_old.html's defaultState, used until the first command is sent.
export function defaultTripState(tripId) {
  return {
    trip_id: tripId,
    status: 'free',
    stage: 'new',
    active_agent: 'scout',
    trip_context: {},
    advisor_state: { conversation_context: { last_advisor_message: null } },
    matcher_state: { conversation_context: { last_meridian_message: null, awaiting: null }, rejected_options: [] },
    planner_state: null,
  };
}

export function normalizeTripRecord(record) {
  const trip_state = isPlainObject(record.trip_state) && Object.keys(record.trip_state).length
    ? record.trip_state
    : defaultTripState(record.id);
  if (!trip_state.trip_id) trip_state.trip_id = record.id;
  return { ...record, trip_state, ui_state: isPlainObject(record.ui_state) ? record.ui_state : {} };
}

// A POST /commands response now carries only the trip_state branches that
// turn actually touched (TWM-154, Backend-owned trimming) — matcher_state /
// planner_state / itinerary_state / logistics_state are simply absent when
// unchanged. The rest of trip_state (stage/active_agent/trip_context) is
// always present. Carry forward each branch's last-known value from the
// previous record instead of letting it go missing client-side, so a page
// reading e.g. planner_state after an unrelated command still sees it.
const COMMAND_RESPONSE_BRANCHES = ['matcher_state', 'planner_state', 'itinerary_state', 'logistics_state'];

export function mergeCommandTripRecord(previous, incoming) {
  const normalized = normalizeTripRecord(incoming);
  if (!previous || previous.id !== normalized.id) return normalized;
  const trip_state = { ...normalized.trip_state };
  for (const branch of COMMAND_RESPONSE_BRANCHES) {
    if (!(branch in trip_state) && previous.trip_state?.[branch] !== undefined) {
      trip_state[branch] = previous.trip_state[branch];
    }
  }
  return { ...normalized, trip_state };
}

// The list response now carries each trip's trip_state directly (Backend
// already had it in hand from the same row — see TripSummary), so this is a
// single request: no more per-trip GET /api/trips/{id} follow-ups just to
// render My Trips cards.
export async function listTrips() {
  const list = await request();
  return (list.trips || []).map(normalizeTripRecord).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

// TWM-189: the traveler's first message and trip creation are now one
// logical request — POST /trips/first-message runs the agent turn before
// any row exists and only persists a row if that turn succeeds, so a
// failed first send never leaves an orphan trip. Every other command
// assumes a trip already exists.
// Entry-command-collapse: always a traveler_message-shaped turn — entryIntent
// (Discover vs. Plan a Trip) decides which specialist receives it, carried
// as data rather than as two separate command names. Both flavors send the
// traveler's own raw message; known-destination no longer pre-parses a
// `destination` field itself — Guide's own extraction is the only thing
// that ever determines `destinations`.
export async function startTripFromFirstMessage({ entryIntent, message, title } = {}) {
  const payload = { entry_intent: entryIntent, message };
  if (title !== undefined) payload.title = title;
  const saved = await request('/first-message', { method: 'POST', body: JSON.stringify(payload) });
  return {
    message: saved.message ?? null,
    agent_meta: saved.agent_meta ?? null,
    trip: normalizeTripRecord(saved.trip),
  };
}

export async function getTrip(id) {
  return normalizeTripRecord(await request(`/${id}`));
}

// TWM-153: matcher recommendations live in their own table now, lazy-loaded
// by whichever page needs the current round (Destinations) instead of
// riding along on every trip GET/command response. Throws TripApiError with
// status 404 when the trip has no matcher round yet — callers treat that as
// "not matched yet", not a real error.
export async function getRecommendations(id) {
  return request(`/${id}/recommendations`);
}

// TWM-159/160: the active itinerary's full Atlas result now lives behind
// its own endpoint — GET /trips/{id} no longer inlines it (only the
// Dashboard needs it). Throws TripApiError with status 404 before any
// itinerary has been generated yet.
export async function getItinerary(id) {
  return request(`/${id}/itinerary`);
}

// TWM-202/TWM-206: the Trip Board adapter's composed item shape — Atlas
// content merged with Trusted Actions feasibility for the itinerary's two
// gateway legs, computed once server-side. GET /trips/{id}/board. This
// replaces bookingCatalog.js's client-side gatewayLegs/transportLegs
// derivation and per-leg fetchLegFeasibility call as the single source of
// truth for which legs are bookable and what modes are feasible for them —
// no separate ad-hoc merge logic in this layer per the adapter's contract.
export async function getTripBoard(id) {
  return request(`/${id}/board`);
}

// TWM-131/132: resolves a single trusted travel action (CHECK_PRICES /
// PROVIDER / SEARCH_REDIRECT) for one leg/domain — POST
// /trips/{id}/trusted-action. Returns a TrustedActionResult, status-
// discriminated (resolved/missing_input/unsupported_partner/disabled); the
// caller must branch on `.status`, never assume `.action` is present.
export async function resolveTrustedAction(id, payload) {
  return request(`/${id}/trusted-action`, { method: 'POST', body: JSON.stringify(payload) });
}

// TWM-131/132: per-route feasibility across all four transport modes
// (flight/train/bus/drive) for an origin/destination pair — POST
// /trips/{id}/trusted-action/feasibility. May return null (Backend has no
// assessment for this route yet); the caller must treat that as "no
// feasibility data", not an error.
export async function getTripFeasibility(id, { origin, destination }) {
  return request(`/${id}/trusted-action/feasibility`, { method: 'POST', body: JSON.stringify({ origin, destination }) });
}

// TWM-146: explicit live flight search — POST /trips/{id}/flight-search.
// Returns a FlightSearchResponse, status-discriminated
// (clarification_needed/unavailable/offer/expired/partial/failed); the
// caller must branch on `.status`, never assume `.offers` is populated.
// Route/date/traveler fields on the payload are all optional at the schema
// level (a vague/partial request is a typed clarification_needed outcome,
// not a validation error) — see bookingCatalog.js's searchFlightOption for
// how this repo currently populates (or honestly omits) each field.
export async function searchFlights(id, payload) {
  return request(`/${id}/flight-search`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function renameTrip(id, title, expectedVersion) {
  const saved = await request(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: expectedVersion, title }),
  });
  return normalizeTripRecord(saved);
}

export async function saveUiState(id, uiState, expectedVersion) {
  const saved = await request(`/${id}/ui-state`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: expectedVersion, ui_state: uiState }),
  });
  return normalizeTripRecord(saved);
}

export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

// The single browser mutation boundary: POST /api/trips/{id}/commands.
// React never sends canonical TripState — only a typed command + bounded payload.
export async function sendTripCommand(id, payload) {
  const saved = await request(`/${id}/commands`, { method: 'POST', body: JSON.stringify(payload) });
  return {
    message: saved.message ?? null,
    agent_meta: saved.agent_meta ?? null,
    trip: normalizeTripRecord(saved.trip),
  };
}

// Serializes mutations per trip id so concurrent saves for the same trip never race.
const saveChains = new Map();
export function queueTripMutation(id, mutation) {
  const previous = saveChains.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(mutation);
  saveChains.set(id, next);
  const clear = () => { if (saveChains.get(id) === next) saveChains.delete(id); };
  next.then(clear, clear);
  return next;
}
