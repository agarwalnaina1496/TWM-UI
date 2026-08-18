import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTrip, getTrip, listTrips, normalizeTripRecord, queueTripMutation, renameTrip, saveUiState, TripApiError,
  resolveTrustedAction, getTripFeasibility,
} from '../../../src/lib/tripApi.js';

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('tripApi', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizeTripRecord fills a default trip_state when the record has none', () => {
    const normalized = normalizeTripRecord({ id: 'trip-1', title: 'Untitled Trip', trip_state: {}, ui_state: null });
    expect(normalized.trip_state.trip_id).toBe('trip-1');
    expect(normalized.trip_state.stage).toBe('new');
    expect(normalized.ui_state).toEqual({});
  });

  it('createTrip posts to /api/trips with credentials included', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Untitled Trip', product_mode: 'self_led', version: 1, trip_state: {}, ui_state: {} }));
    const record = await createTrip();
    expect(fetchMock).toHaveBeenCalledWith('/api/trips', expect.objectContaining({
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ title: 'Untitled Trip', product_mode: 'self_led' }),
    }));
    expect(record.id).toBe('trip-1');
  });

  it('listTrips fetches the list in a single request (trip_state travels with the summary), sorted by updated_at descending', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        { id: 'a', trip_state: {}, updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'b', trip_state: {}, updated_at: '2026-06-01T00:00:00.000Z' },
      ],
    }));
    const records = await listTrips();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips', expect.objectContaining({ credentials: 'include' }));
    expect(records.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('getTrip normalizes the fetched record', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'trip-1', trip_state: {}, ui_state: {} }));
    const record = await getTrip('trip-1');
    expect(record.trip_state.stage).toBe('new');
  });

  it('renameTrip sends expected_version and title via PATCH', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Goa Trip', version: 2, trip_state: {}, ui_state: {} }));
    const record = await renameTrip('trip-1', 'Goa Trip', 1);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Goa Trip' }),
    }));
    expect(record.title).toBe('Goa Trip');
  });

  it('saveUiState PATCHes the ui-state endpoint with expected_version', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'trip-1', version: 2, trip_state: {}, ui_state: { collapsed: true } }));
    const record = await saveUiState('trip-1', { collapsed: true }, 1);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/ui-state', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, ui_state: { collapsed: true } }),
    }));
    expect(record.ui_state).toEqual({ collapsed: true });
  });

  it('throws a TripApiError with status and message on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
    await expect(getTrip('missing')).rejects.toMatchObject({ status: 404, message: 'Trip not found.' });
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
    await expect(getTrip('missing')).rejects.toBeInstanceOf(TripApiError);
  });

  it('surfaces a version-conflict 409 for the caller to handle', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Version conflict.' }, { status: 409 }));
    await expect(renameTrip('trip-1', 'New title', 1)).rejects.toMatchObject({ status: 409 });
  });

  it('queueTripMutation serializes mutations for the same id in order', async () => {
    const order = [];
    const first = queueTripMutation('trip-1', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      order.push('first');
    });
    const second = queueTripMutation('trip-1', async () => {
      order.push('second');
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  it('queueTripMutation lets a later mutation proceed after an earlier one fails', async () => {
    const first = queueTripMutation('trip-2', async () => { throw new Error('boom'); });
    const second = queueTripMutation('trip-2', async () => 'ok');
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('ok');
  });

  // TWM-132: the two new TWM-130/131 trusted-action endpoints.
  it('resolveTrustedAction POSTs the request payload to /trips/{id}/trusted-action', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'resolved', generated_at: '2026-01-01T00:00:00.000Z', action: { action_type: 'SEARCH_REDIRECT', domain: 'flight', target: { partner: 'ixigo', path: 'search', query_params: {}, target_url: 'https://www.ixigo.com/search' }, internal_capability: null, affiliate_disclosure: true, generated_at: '2026-01-01T00:00:00.000Z' } }));
    const payload = { action_type: 'SEARCH_REDIRECT', domain: 'flight', origin: 'Delhi', destination: 'Goa' };
    const result = await resolveTrustedAction('trip-1', payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/trusted-action', expect.objectContaining({
      method: 'POST', body: JSON.stringify(payload),
    }));
    expect(result.status).toBe('resolved');
    expect(result.action.target.target_url).toBe('https://www.ixigo.com/search');
  });

  it('resolveTrustedAction surfaces a missing_input result without throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'missing_input', generated_at: '2026-01-01T00:00:00.000Z', missing_input: { missing_fields: ['origin'], message: 'Tell us the missing details.' } }));
    const result = await resolveTrustedAction('trip-1', { action_type: 'SEARCH_REDIRECT', domain: 'train' });
    expect(result).toMatchObject({ status: 'missing_input' });
  });

  it('getTripFeasibility POSTs origin/destination to the feasibility endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ modes: [{ mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'x' }] }));
    const result = await getTripFeasibility('trip-1', { origin: 'Delhi', destination: 'Goa' });
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/trusted-action/feasibility', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ origin: 'Delhi', destination: 'Goa' }),
    }));
    expect(result.modes[0].mode).toBe('flight');
  });

  it('getTripFeasibility can resolve null when the Backend has no assessment yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const result = await getTripFeasibility('trip-1', { origin: 'Delhi', destination: 'Goa' });
    expect(result).toBeNull();
  });
});
