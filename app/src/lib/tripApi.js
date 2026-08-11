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

// Backend hasn't wired real trip commands yet (TWM-110), so a freshly created
// trip has no meaningful trip_state — this mirrors index_old.html's defaultState.
export function defaultTripState(tripId) {
  return {
    trip_id: tripId,
    status: 'free',
    stage: 'new',
    active_agent: 'scout',
    trip_context: {},
    advisor_state: { conversation_context: { last_advisor_message: null }, artifacts: [] },
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

export async function listTrips() {
  const list = await request();
  const records = await Promise.all((list.trips || []).map(summary => request(`/${summary.id}`)));
  return records.map(normalizeTripRecord).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
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
