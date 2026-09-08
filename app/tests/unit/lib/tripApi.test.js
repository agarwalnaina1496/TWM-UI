import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTrip, listTrips, queueTripMutation, renameTrip, saveUiState, TripApiError,
  resolveTrustedAction, resolveBookingOptions, getTripFeasibility, searchFlights, startTripFromFirstMessage,
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

  // TWM-220: getTrip returns the composed TripView verbatim — no client-side
  // trip_state synthesis.
  it('getTrip returns the TripView payload as-is', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'trip-1', version: 3, lifecycle: { stage: 'matching' } }));
    const view = await getTrip('trip-1');
    expect(view).toEqual({ id: 'trip-1', version: 3, lifecycle: { stage: 'matching' } });
  });

  it('startTripFromFirstMessage posts to first-message and returns the new trip id + version', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      message: 'Got it.',
      agent_meta: null,
      recommendation: null,
      trip: { id: 'trip-1', version: 1, trip_state: {} },
    }));
    const response = await startTripFromFirstMessage({ entryIntent: 'discover', message: 'Suggest mountains' });
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/first-message', expect.objectContaining({
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ entry_intent: 'discover', message: 'Suggest mountains' }),
    }));
    expect(response).toMatchObject({ tripId: 'trip-1', version: 1, message: 'Got it.' });
  });

  it('listTrips fetches the list in a single request, sorted by updated_at descending', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        { id: 'a', updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'b', updated_at: '2026-06-01T00:00:00.000Z' },
      ],
    }));
    const records = await listTrips();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips', expect.objectContaining({ credentials: 'include' }));
    expect(records.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('renameTrip sends expected_version and title via PATCH and returns the fresh view', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Goa Trip', version: 2 }));
    const view = await renameTrip('trip-1', 'Goa Trip', 1);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Goa Trip' }),
    }));
    expect(view.title).toBe('Goa Trip');
  });

  it('saveUiState PATCHes the ui-state endpoint with expected_version', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'trip-1', version: 2, ui_state: { collapsed: true } }));
    const view = await saveUiState('trip-1', { collapsed: true }, 1);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/ui-state', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, ui_state: { collapsed: true } }),
    }));
    expect(view.ui_state).toEqual({ collapsed: true });
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
    const second = queueTripMutation('trip-1', async () => { order.push('second'); });
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  it('queueTripMutation lets a later mutation proceed after an earlier one fails', async () => {
    const first = queueTripMutation('trip-2', async () => { throw new Error('boom'); });
    const second = queueTripMutation('trip-2', async () => 'ok');
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('ok');
  });

  it('resolveTrustedAction POSTs the request payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'resolved', generated_at: 't', action: { action_type: 'SEARCH_REDIRECT', domain: 'flight', target: { partner: 'ixigo', target_url: 'https://www.ixigo.com/search' }, affiliate_disclosure: true } }));
    const payload = { action_type: 'SEARCH_REDIRECT', domain: 'flight', origin: 'Delhi', destination: 'Goa' };
    const result = await resolveTrustedAction('trip-1', payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/trusted-action', expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }));
    expect(result.status).toBe('resolved');
  });

  // TWM-220: the batch drawer endpoint.
  it('resolveBookingOptions POSTs the batch payload to /booking-options', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [
      { target: { kind: 'mode', value: 'flight' }, status: 'resolved', generated_at: 't', action: { action_type: 'SEARCH_REDIRECT', domain: 'flight', target: { partner: 'aviasales', target_url: 'https://x' }, affiliate_disclosure: true } },
      { target: { kind: 'mode', value: 'train' }, status: 'missing_input', generated_at: 't', missing_input: { missing_fields: ['origin'], message: 'x' } },
    ] }));
    const payload = { domain: 'transport', from_city: 'Delhi', to_city: 'Goa', party: { adults: 2, children: 0, infants: 0 }, targets: [{ kind: 'mode', value: 'flight' }, { kind: 'mode', value: 'train' }] };
    const result = await resolveBookingOptions('trip-1', payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/booking-options', expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }));
    expect(result.results.map(r => r.status)).toEqual(['resolved', 'missing_input']);
  });

  it('getTripFeasibility POSTs origin/destination', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ modes: [{ mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'x' }] }));
    const result = await getTripFeasibility('trip-1', { origin: 'Delhi', destination: 'Goa' });
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/trusted-action/feasibility', expect.objectContaining({ method: 'POST', body: JSON.stringify({ origin: 'Delhi', destination: 'Goa' }) }));
    expect(result.modes[0].mode).toBe('flight');
  });

  it('getTripFeasibility can resolve null', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    expect(await getTripFeasibility('trip-1', { origin: 'Delhi', destination: 'Goa' })).toBeNull();
  });

  it('searchFlights POSTs the payload to /flight-search', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'clarification_needed', clarification: { missing_fields: ['departure_date'], message: 'x' } }));
    const result = await searchFlights('trip-1', { departure_date: '2026-03-01' });
    expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1/flight-search', expect.objectContaining({ method: 'POST', body: JSON.stringify({ departure_date: '2026-03-01' }) }));
    expect(result.status).toBe('clarification_needed');
  });
});
