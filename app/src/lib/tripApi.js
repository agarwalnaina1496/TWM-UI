const TRIPS_PATH = '/api/trips';

export class TripApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = 'TripApiError';
    this.status = status;
    this.payload = payload;
  }
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

// TWM-217/TWM-220: GET/PATCH /trips/{id} return the one server-composed
// `TripView` read model verbatim — no client-side trip_state synthesis or
// branch merging any more. Its shape:
//   { id, title, product_mode, version, ui_state,
//     lifecycle: { stage, status, active_agent, selected_option },
//     context_recap: [ { key, label, value } ],
//     plan: { places, day_plan, frozen, awaiting } | null,
//     matcher: { last_message, awaiting, has_recommendation },
//     summary | booking | budget_breakdown | open_gaps | before_you_go
//       — all null until an itinerary exists (summary != null is the signal). }
// GET /trips returns the thin TripListItem subset (lifecycle, context_recap,
// travel_window, has_places/has_day_plan/has_itinerary/awaiting,
// matcher.has_recommendation).

// A POST /commands response still carries the touched-branch trip_state
// shape (TripCommandResponse); TripContext re-fetches the TripView after a
// mutating command rather than merging that shape client-side. So the only
// thing this layer reads off a command response is message / agent_meta /
// recommendation.

export async function listTrips() {
  const list = await request();
  return (list.trips || []).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

// TWM-189: the traveler's first message and trip creation are one logical
// request — POST /trips/first-message runs the agent turn before any row
// exists and only persists a row if that turn succeeds. Returns the
// touched-branch command response; the caller re-fetches the TripView.
export async function startTripFromFirstMessage({ entryIntent, message, title } = {}) {
  const payload = { entry_intent: entryIntent, message };
  if (title !== undefined) payload.title = title;
  const saved = await request('/first-message', { method: 'POST', body: JSON.stringify(payload) });
  return {
    message: saved.message ?? null,
    agent_meta: saved.agent_meta ?? null,
    recommendation: saved.recommendation ?? null,
    tripId: saved.trip.id,
    version: saved.trip.version,
  };
}

export async function getTrip(id) {
  return request(`/${id}`);
}

// TWM-153: matcher recommendations live in their own table, lazy-loaded by
// whichever page needs the current round (Destinations) on mount only —
// after a command the round arrives inline on the command response
// (TWM-217). Throws TripApiError 404 when the trip has no round yet.
export async function getRecommendations(id) {
  return request(`/${id}/recommendations`);
}

// TWM-217: GET /trips/{id}/itinerary is the enriched Atlas document — the
// full day-by-day result, plus per-timeline-item `id` / `is_gateway_leg` /
// `resolved_date` / `date_precision` / `date_source`, plus a top-level
// `stay_segments[]`. Throws TripApiError 404 before any itinerary exists.
export async function getItinerary(id) {
  return request(`/${id}/itinerary`);
}

// TWM-131/132: resolves a single trusted travel action for one leg/domain.
export async function resolveTrustedAction(id, payload) {
  return request(`/${id}/trusted-action`, { method: 'POST', body: JSON.stringify(payload) });
}

// TWM-220: one open drawer's worth of targets resolved server-side in a
// single request — a fan-out over the same resolver `resolveTrustedAction`
// uses. `payload`: { domain: "transport" | "stay", from_city?, to_city?,
// destination?, departure_date?, return_date?, trip_shape?,
// party: { adults, children, infants }, targets: [ { kind, value } ] }.
// Returns { results: [ { target, ...TrustedActionResult } ] }; one target's
// non-`resolved` outcome never fails the batch.
export async function resolveBookingOptions(id, payload) {
  return request(`/${id}/booking-options`, { method: 'POST', body: JSON.stringify(payload) });
}

// TWM-131/132: per-route feasibility across flight/train/bus/drive. May
// return null (no assessment yet); treat that as "no feasibility data".
export async function getTripFeasibility(id, { origin, destination }) {
  return request(`/${id}/trusted-action/feasibility`, { method: 'POST', body: JSON.stringify({ origin, destination }) });
}

// TWM-146: explicit live flight search — status-discriminated response.
export async function searchFlights(id, payload) {
  return request(`/${id}/flight-search`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function renameTrip(id, title, expectedVersion) {
  return request(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: expectedVersion, title }),
  });
}

export async function saveUiState(id, uiState, expectedVersion) {
  return request(`/${id}/ui-state`, {
    method: 'PATCH',
    body: JSON.stringify({ expected_version: expectedVersion, ui_state: uiState }),
  });
}

export function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

// The single browser mutation boundary: POST /api/trips/{id}/commands.
// React never sends canonical TripState — only a typed command + bounded
// payload. The response carries the touched-branch trip_state; the caller
// (TripContext) re-fetches the TripView.
export async function sendTripCommand(id, payload) {
  const saved = await request(`/${id}/commands`, { method: 'POST', body: JSON.stringify(payload) });
  return {
    message: saved.message ?? null,
    agent_meta: saved.agent_meta ?? null,
    recommendation: saved.recommendation ?? null,
    version: saved.trip.version,
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
