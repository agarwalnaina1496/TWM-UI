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

async function request(path = '', options = {}) {
  const response = await fetch(`${TRIPS_PATH}${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
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
    matcher_state: { conversation_context: { last_meridian_message: null, awaiting: null }, recommendations: [], rejected_options: [] },
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

export async function createTrip({ title = 'Untitled Trip', product_mode = 'self_led' } = {}) {
  const created = await request('', { method: 'POST', body: JSON.stringify({ title, product_mode }) });
  return normalizeTripRecord(created);
}

export async function getTrip(id) {
  return normalizeTripRecord(await request(`/${id}`));
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
