import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';
import { mockFetchWithGuestSession } from '../testUtils.js';

function wrapper({ children }) {
  return <MemoryRouter><TripProvider>{children}</TripProvider></MemoryRouter>;
}

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// TWM-220: GET /trips returns thin TripListItem rows; GET/PATCH /trips/{id}
// return the composed TripView; POST /commands & /first-message return only
// message/agent_meta/recommendation (+ a stub trip {id, version}) and the
// context re-fetches the TripView.
function listItem(id, overrides = {}) {
  return {
    id, title: id.toUpperCase(), product_mode: 'self_led', version: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    lifecycle: { stage: 'new', status: 'free', active_agent: null, selected_option: null },
    context_recap: [], travel_window: null,
    has_places: false, has_day_plan: false, has_itinerary: false, awaiting: null, has_recommendation: false,
    ...overrides,
  };
}
function tripView(id, overrides = {}) {
  return {
    id, title: id.toUpperCase(), product_mode: 'self_led', version: 2, ui_state: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    lifecycle: { stage: 'new', status: 'free', active_agent: null, selected_option: null },
    context_recap: [], plan: null,
    matcher: { last_message: null, awaiting: null, has_recommendation: false },
    summary: null, booking: null, budget_breakdown: null, open_gaps: null, before_you_go: null,
    ...overrides,
  };
}
function commandResp({ message = 'Got it.', recommendation = null, id = 'trip-1', version = 2 } = {}) {
  return jsonResponse({ message, agent_meta: null, recommendation, trip: { id, version } });
}

describe('TripContext auth state', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValue(jsonResponse({ trips: [] }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to an anonymous guest with access (TWM-140 guest-first)', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('login calls the real endpoint and sets loggedIn from the response', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      if (url === '/api/auth/login') return Promise.resolve(jsonResponse({ id: 'u1', email: 't@example.com', claimed_trip_count: 0 }));
      return Promise.resolve(jsonResponse({ trips: [] }));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });
    await act(async () => { await result.current.login('t@example.com', 'hunter22!!'); });
    expect(result.current.auth).toEqual({ loggedIn: true, isGuest: false, name: 't@example.com', email: 't@example.com' });
  });

  it('login rejects and leaves auth unchanged on wrong credentials', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      if (url === '/api/auth/login') return Promise.resolve(jsonResponse({ detail: 'Incorrect email or password.' }, { status: 401 }));
      return Promise.resolve(jsonResponse({ trips: [] }));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });
    await expect(act(async () => { await result.current.login('t@example.com', 'wrong'); })).rejects.toThrow();
    expect(result.current.auth.loggedIn).toBe(false);
  });

  it('signup does not auto-login', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      if (url === '/api/auth/signup') return Promise.resolve(jsonResponse({ id: 'u1', email: 't@example.com', claimed_trip_count: 0 }, { status: 201 }));
      if (url === '/api/auth/login') throw new Error('signup must not call /api/auth/login');
      return Promise.resolve(jsonResponse({ trips: [] }));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });
    let signupResult;
    await act(async () => { signupResult = await result.current.signup('t@example.com', 'hunter22!!'); });
    expect(signupResult.email).toBe('t@example.com');
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
  });

  it('signup sets a claim notice when trips were reassigned', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      if (url === '/api/auth/signup') return Promise.resolve(jsonResponse({ id: 'u1', email: 't@example.com', claimed_trip_count: 2 }, { status: 201 }));
      return Promise.resolve(jsonResponse({ trips: [] }));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });
    await act(async () => { await result.current.signup('t@example.com', 'hunter22!!'); });
    expect(result.current.claimNotice).toEqual({ count: 2 });
  });

  it('logout resets to the default anonymous-guest state', async () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.setAuthDirect({ loggedIn: true, isGuest: false, name: 't@example.com', email: 't@example.com' }));
    await act(async () => { await result.current.logout(); });
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
  });

  it('setContact updates name/email without changing loggedIn/isGuest', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.continueWithoutLogin());
    act(() => result.current.setContact({ name: 'Jane', email: 'jane@example.com' }));
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Jane', email: 'jane@example.com' });
  });

  it('opens and closes the login overlay', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.openLoginModal());
    expect(result.current.loginModalOpen).toBe(true);
    act(() => result.current.closeLoginModal());
    expect(result.current.loginModalOpen).toBe(false);
  });
});

describe('TripContext trip record (TWM-220 TripView shape)', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses an existing trip on boot instead of creating a new one', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-1')] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not create a trip on boot when none exist yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a trip via startTrip on the first message, then loads its TripView', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))                    // boot list
      .mockResolvedValueOnce(commandResp({ id: 'trip-new' }))               // POST /first-message
      .mockResolvedValueOnce(jsonResponse(tripView('trip-new', {           // GET /trips/trip-new
        lifecycle: { stage: 'matching', status: 'free', active_agent: 'meridian', selected_option: null },
      })));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.startTrip({ entryIntent: 'discover', message: 'Plan my Coorg trip' }); });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/trips/first-message', expect.objectContaining({ method: 'POST' }));
    expect(result.current.currentTripId).toBe('trip-new');
    expect(result.current.commandSnapshot.lifecycle.stage).toBe('matching');
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-new']);
  });

  it('sendTripCommand rejects when no trip exists yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    await expect(
      act(async () => { await result.current.sendTripCommand('traveler_message', { message: 'hi' }); })
    ).rejects.toThrow('No trip exists yet');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sendTripCommand re-fetches the TripView and returns the message + round', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-1')] }))              // boot list
      .mockResolvedValueOnce(commandResp({ message: 'Here are options.', recommendation: { version: 1, status: 'SUCCESS', options: [] } })) // POST /commands
      .mockResolvedValueOnce(jsonResponse(tripView('trip-1', { version: 3,              // GET /trips/trip-1
        lifecycle: { stage: 'recommended', status: 'free', active_agent: null, selected_option: null },
        matcher: { last_message: 'Here are options.', awaiting: null, has_recommendation: true },
      })));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    let response;
    await act(async () => { response = await result.current.sendTripCommand('continue'); });

    expect(response.message).toBe('Here are options.');
    expect(response.recommendation.status).toBe('SUCCESS');
    expect(response.trip.lifecycle.stage).toBe('recommended');
    expect(result.current.commandSnapshot.version).toBe(3);
    expect(result.current.commandSnapshot.matcher.has_recommendation).toBe(true);
  });

  it('sets tripLoadStatus to error without throwing when the Backend is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('error'));
    expect(result.current.tripLoadError).toBeTruthy();
    expect(result.current.currentTripId).toBe(null);
  });

  it('renameCurrentTrip PATCHes and keeps currentTripId stable', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-1')] }))
      .mockResolvedValueOnce(jsonResponse(tripView('trip-1', { title: 'Goa Getaway', version: 2 })));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.renameCurrentTrip('Goa Getaway'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Goa Getaway' }),
    }));
    expect(result.current.currentTripId).toBe('trip-1');
    expect(result.current.commandSnapshot.title).toBe('Goa Getaway');
  });

  // TWM-219: the legacy in-memory mock trip-state is gone.
  it('exposes no `trip` / `updateTrip` and touches no localStorage on boot', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-1')] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.trip).toBeUndefined();
    expect(result.current.updateTrip).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });
});

describe('TripContext multi-trip handling', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boots to the URL-provided trip id instead of records[0]', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }));
    function w({ children }) {
      return <MemoryRouter initialEntries={['/dashboard?tripId=trip-b']}><TripProvider>{children}</TripProvider></MemoryRouter>;
    }
    const { result } = renderHook(() => useTrip(), { wrapper: w });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-b');
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a', 'trip-b']);
  });

  it('falls back to records[0] when the URL trip id matches nothing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a')] }));
    function w({ children }) {
      return <MemoryRouter initialEntries={['/dashboard?tripId=nope']}><TripProvider>{children}</TripProvider></MemoryRouter>;
    }
    const { result } = renderHook(() => useTrip(), { wrapper: w });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('keeps every listed trip in `trips`', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [listItem('trip-a', { updated_at: '2026-01-02T00:00:00.000Z' }), listItem('trip-b', { updated_at: '2026-01-01T00:00:00.000Z' })],
    }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a', 'trip-b']);
    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('startNewTrip clears the current trip locally without a Backend call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-1')] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    const before = fetchMock.mock.calls.length;
    act(() => { result.current.startNewTrip(); });
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(result.current.currentTripId).toBe(null);
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-1']);
  });

  it('openTrip switches the current trip via a plain GET, never a command', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a', { lifecycle: { stage: 'matched', status: 'free', active_agent: null, selected_option: null } }), listItem('trip-b')] }))
      .mockResolvedValueOnce(jsonResponse(tripView('trip-b', { lifecycle: { stage: 'planning', status: 'free', active_agent: 'guide', selected_option: null } })));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.openTrip('trip-b'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-b', expect.not.objectContaining({ method: expect.anything() }));
    expect(result.current.currentTripId).toBe('trip-b');
    expect(result.current.commandSnapshot.lifecycle.stage).toBe('planning');
  });

  it('openTrip does not re-fetch when the current trip already came from a full fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-b')] }))
      .mockResolvedValueOnce(jsonResponse(tripView('trip-b', { lifecycle: { stage: 'planning', status: 'free', active_agent: 'guide', selected_option: null } })));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.openTrip('trip-b'); });
    const after = fetchMock.mock.calls.length;
    await act(async () => { await result.current.openTrip('trip-b'); });
    expect(fetchMock.mock.calls.length).toBe(after);
  });

  it('viewTrip delegates to a full fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a')] }))
      .mockResolvedValueOnce(jsonResponse(tripView('trip-a', {
        plan: { places: [], day_plan: [], frozen: false, awaiting: 'trip_duration' },
      })));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.viewTrip('trip-a'); });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-a', expect.not.objectContaining({ method: expect.anything() }));
    expect(result.current.commandSnapshot.plan.awaiting).toBe('trip_duration');
  });

  it('renameTrip renames a non-current trip without switching currentTripId', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }))
      .mockResolvedValueOnce(jsonResponse(tripView('trip-b', { title: 'Goa', version: 2 })));

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

  it('openTrip fails closed on a 404 (TWM-109)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    let outcome;
    await act(async () => { outcome = await result.current.openTrip('trip-b'); });
    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a']);
    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('renameTrip fails closed on a 404 (TWM-109)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }))
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
      .mockResolvedValueOnce(jsonResponse({ trips: [listItem('trip-a')] }))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.trips).toHaveLength(1);

    await act(async () => { await result.current.retryTripLoad(); });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('error'));
    expect(result.current.trips).toEqual([]);
  });
});
