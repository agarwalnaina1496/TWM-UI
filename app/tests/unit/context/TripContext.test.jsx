import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';

function wrapper({ children }) {
  return <TripProvider>{children}</TripProvider>;
}

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('TripContext auth state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to an anonymous guest with access (TWM-140 guest-first)', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('login sets loggedIn true and isGuest false', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.login({ name: 'Traveler', email: 't@example.com' }));
    expect(result.current.auth).toEqual({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('continueWithoutLogin sets isGuest true and loggedIn false', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.continueWithoutLogin());
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('logout resets to the default anonymous-guest state, keeping access', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.login({ name: 'Traveler', email: 't@example.com' }));
    act(() => result.current.logout());
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('setContact updates name/email without changing loggedIn/isGuest', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.continueWithoutLogin());
    act(() => result.current.setContact({ name: 'Jane', email: 'jane@example.com' }));
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Jane', email: 'jane@example.com' });
  });

  it('persists trip and auth to localStorage and reloads them', () => {
    const { result, unmount } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.login({ name: 'Traveler', email: 't@example.com' }));
    act(() => result.current.updateTrip({ destination: { type: 'single', name: 'Coorg', places: null } }));
    unmount();

    const { result: reloaded } = renderHook(() => useTrip(), { wrapper });
    expect(reloaded.current.auth.name).toBe('Traveler');
    expect(reloaded.current.trip.destination).toEqual({ type: 'single', name: 'Coorg', places: null });
  });

  it('preserves and clears a pending return route around a login action (TWM-140)', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    expect(result.current.pendingReturnTo).toBe(null);
    act(() => result.current.setPendingReturnTo('/my-trips'));
    expect(result.current.pendingReturnTo).toBe('/my-trips');
    act(() => result.current.setPendingReturnTo(null));
    expect(result.current.pendingReturnTo).toBe(null);
  });

});

describe('TripContext Backend-authoritative trip record', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses an existing trip on boot instead of creating a new one', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {}, updated_at: '2026-01-01T00:00:00.000Z' }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates a trip on boot when none exist yet', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-new', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-new');
  });

  it('sets tripLoadStatus to error without throwing when the Backend is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('error'));
    expect(result.current.tripLoadError).toBeTruthy();
    expect(result.current.currentTripId).toBe(null);
  });

  it('renameCurrentTrip PATCHes the Backend and updates currentTripId stays stable', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Goa Getaway', version: 2, trip_state: {}, ui_state: {} }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.renameCurrentTrip('Goa Getaway'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Goa Getaway' }),
    }));
    expect(result.current.currentTripId).toBe('trip-1');
  });

  it('does not persist mock trip content (destination/places/days) to the Backend', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    act(() => result.current.updateTrip({ destination: { type: 'single', name: 'Coorg', places: null } }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const stored = JSON.parse(localStorage.getItem('twm_prototype_state_v1'));
    expect(stored.trip.destination).toEqual({ type: 'single', name: 'Coorg', places: null });
  });
});

describe('TripContext multi-trip handling (TWM-108)', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps every listed trip in `trips` instead of discarding all but the first', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [{ id: 'trip-a' }, { id: 'trip-b' }],
    })).mockResolvedValueOnce(jsonResponse({ id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {}, updated_at: '2026-01-02T00:00:00.000Z' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {}, updated_at: '2026-01-01T00:00:00.000Z' }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a', 'trip-b']);
    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('startNewTrip creates a real separate Backend trip and preserves existing trips', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-2', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }, { status: 201 }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    act(() => result.current.updateTrip({ destination: { type: 'single', name: 'Coorg', places: null } }));

    await act(async () => { await result.current.startNewTrip(); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips', expect.objectContaining({ method: 'POST' }));
    expect(result.current.currentTripId).toBe('trip-2');
    expect(result.current.trips.map(t => t.id).sort()).toEqual(['trip-1', 'trip-2']);
    expect(result.current.trip.destination).toBe(null);
  });

  it('openTrip switches the current trip via a plain GET, never a command', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-a' }, { id: 'trip-b' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-a', title: 'A', version: 1, trip_state: { stage: 'matched' }, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: { stage: 'planning' }, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: { stage: 'planning' }, ui_state: {} }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.openTrip('trip-b'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-b', expect.not.objectContaining({ method: expect.anything() }));
    expect(result.current.currentTripId).toBe('trip-b');
    expect(result.current.commandSnapshot.trip_state.stage).toBe('planning');
  });

  it('renameTrip renames a non-current trip without switching currentTripId', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-a' }, { id: 'trip-b' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'Goa', version: 2, trip_state: {}, ui_state: {} }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.renameTrip('trip-b', 'Goa'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-b', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Goa' }),
    }));
    expect(result.current.currentTripId).toBe('trip-a');
    expect(result.current.trips.find(t => t.id === 'trip-b').title).toBe('Goa');
  });

  it('openTrip fails closed on a 404 instead of throwing uncaught (TWM-109)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-a' }, { id: 'trip-b' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    let outcome;
    await act(async () => { outcome = await result.current.openTrip('trip-b'); });

    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a']);
    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('renameTrip fails closed on a 404 instead of throwing uncaught (TWM-109)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-a' }, { id: 'trip-b' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {} }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    let outcome;
    await act(async () => { outcome = await result.current.renameTrip('trip-b', 'Goa'); });

    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a']);
  });

  it('clears `trips` instead of leaving it stale when a refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-a' }] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} }))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.trips).toHaveLength(1);

    await act(async () => { await result.current.retryTripLoad(); });

    await waitFor(() => expect(result.current.tripLoadStatus).toBe('error'));
    expect(result.current.trips).toEqual([]);
  });
});
