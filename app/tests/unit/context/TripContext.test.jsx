import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useTrip } from '../../../src/context/TripContext.jsx';
import { useTripsQuery } from '../../../src/hooks/tripQueries.js';
import { AppProviders, mockFetchWithGuestSession } from '../testUtils.js';

function wrapper({ children }) {
  return <MemoryRouter><AppProviders>{children}</AppProviders></MemoryRouter>;
}

// TWM-221: the trip list is its own React Query now, not a context field —
// render it alongside useTrip() so assertions that used to read
// `result.current.trips` can read `result.current.tripsList`.
function useTripAndList() {
  const ctx = useTrip();
  const tripsQuery = useTripsQuery();
  return { ...ctx, tripsList: tripsQuery.data ?? [] };
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

  it('resolves the current trip id from the boot list (most recent), never creating one', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-1')] }));
      return Promise.resolve(jsonResponse(tripView('trip-1')));
    });
    const { result } = renderHook(() => useTripAndList(), { wrapper });
    await waitFor(() => expect(result.current.currentTripId).toBe('trip-1'));
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.tripsList.map(t => t.id)).toEqual(['trip-1']);
    expect(fetchMock.mock.calls.every(([, o]) => !o || o.method === undefined || o.method === 'GET')).toBe(true);
  });

  it('does not create a trip on boot when none exist yet', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ trips: [] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe(null);
  });

  it('creates a trip via startTrip on the first message, then loads its TripView', async () => {
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [] }));
      if (url === '/api/trips/first-message') return Promise.resolve(commandResp({ id: 'trip-new' }));
      if (url === '/api/trips/trip-new') return Promise.resolve(jsonResponse(tripView('trip-new', {
        lifecycle: { stage: 'matching', status: 'free', active_agent: 'meridian', selected_option: null },
      })));
      return Promise.resolve(jsonResponse({}));
    });

    const { result } = renderHook(() => useTripAndList(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.startTrip({ entryIntent: 'discover', message: 'Plan my Coorg trip' }); });

    expect(fetchMock).toHaveBeenCalledWith('/api/trips/first-message', expect.objectContaining({ method: 'POST' }));
    expect(result.current.currentTripId).toBe('trip-new');
    await waitFor(() => expect(result.current.commandSnapshot?.lifecycle.stage).toBe('matching'));
    await waitFor(() => expect(result.current.tripsList.map(t => t.id)).toEqual(['trip-new']));
  });

  it('sendTripCommand rejects when no trip exists yet', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ trips: [] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    await expect(
      act(async () => { await result.current.sendTripCommand('traveler_message', { message: 'hi' }); })
    ).rejects.toThrow('No trip exists yet');
  });

  it('sendTripCommand re-fetches the TripView into cache and returns the message + round', async () => {
    let tripVersion = 2;
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-1')] }));
      if (url === '/api/trips/trip-1/commands') {
        tripVersion = 3;
        return Promise.resolve(commandResp({ message: 'Here are options.', recommendation: { version: 1, status: 'SUCCESS', options: [] } }));
      }
      if (url === '/api/trips/trip-1') return Promise.resolve(jsonResponse(tripView('trip-1', {
        version: tripVersion,
        lifecycle: { stage: tripVersion === 3 ? 'recommended' : 'new', status: 'free', active_agent: null, selected_option: null },
        matcher: { last_message: 'Here are options.', awaiting: null, has_recommendation: tripVersion === 3 },
      })));
      return Promise.resolve(jsonResponse({}));
    });

    const { result } = renderHook(() => useTrip(), { wrapper });
    await act(async () => { await result.current.setCurrentTripId('trip-1'); });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    let response;
    await act(async () => { response = await result.current.sendTripCommand('continue'); });

    expect(response.message).toBe('Here are options.');
    expect(response.recommendation.status).toBe('SUCCESS');
    expect(response.trip.lifecycle.stage).toBe('recommended');
    await waitFor(() => expect(result.current.commandSnapshot.version).toBe(3));
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
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-1')] }));
      if (url === '/api/trips/trip-1' && options?.method === 'PATCH') return Promise.resolve(jsonResponse(tripView('trip-1', { title: 'Goa Getaway', version: 2 })));
      if (url === '/api/trips/trip-1') return Promise.resolve(jsonResponse(tripView('trip-1')));
      return Promise.resolve(jsonResponse({}));
    });

    const { result } = renderHook(() => useTrip(), { wrapper });
    await act(async () => { await result.current.setCurrentTripId('trip-1'); });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.renameCurrentTrip('Goa Getaway'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 2, title: 'Goa Getaway' }),
    }));
    expect(result.current.currentTripId).toBe('trip-1');
    await waitFor(() => expect(result.current.commandSnapshot.title).toBe('Goa Getaway'));
  });

  // TWM-219/TWM-221: no legacy in-memory mock trip-state, no localStorage.
  it('exposes no `trip` / `updateTrip` / `openTrip` and touches no localStorage on boot', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ trips: [listItem('trip-1')] }));
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.trip).toBeUndefined();
    expect(result.current.updateTrip).toBeUndefined();
    expect(result.current.openTrip).toBeUndefined();
    expect(result.current.viewTrip).toBeUndefined();
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

  it('boots to the URL-provided trip id', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }));
      if (/^\/api\/trips\/[^/]+/.test(url)) return Promise.resolve(jsonResponse(tripView('trip-b')));
      return Promise.resolve(jsonResponse({}));
    });
    function w({ children }) {
      return <MemoryRouter initialEntries={['/dashboard?tripId=trip-b']}><AppProviders>{children}</AppProviders></MemoryRouter>;
    }
    const { result } = renderHook(() => useTripAndList(), { wrapper: w });
    await waitFor(() => expect(result.current.currentTripId).toBe('trip-b'));
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.tripsList.map(t => t.id)).toEqual(['trip-a', 'trip-b']);
  });

  it('falls back to the most recent trip when the URL trip id matches nothing', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-a')] }));
      return Promise.resolve(jsonResponse(tripView('trip-a')));
    });
    function w({ children }) {
      return <MemoryRouter initialEntries={['/dashboard?tripId=nope']}><AppProviders>{children}</AppProviders></MemoryRouter>;
    }
    const { result } = renderHook(() => useTrip(), { wrapper: w });
    await waitFor(() => expect(result.current.currentTripId).toBe('trip-a'));
  });

  it('keeps every listed trip in the list query, most-recent first', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({
        trips: [listItem('trip-b', { updated_at: '2026-01-01T00:00:00.000Z' }), listItem('trip-a', { updated_at: '2026-01-02T00:00:00.000Z' })],
      }));
      return Promise.resolve(jsonResponse(tripView('trip-a')));
    });
    const { result } = renderHook(() => useTripAndList(), { wrapper });
    await waitFor(() => expect(result.current.tripsList.map(t => t.id)).toEqual(['trip-a', 'trip-b']));
    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('startNewTrip clears the current trip locally without a Backend call', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-1')] }));
      return Promise.resolve(jsonResponse(tripView('trip-1')));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.currentTripId).toBe('trip-1'));
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    const before = fetchMock.mock.calls.length;
    act(() => { result.current.startNewTrip(); });
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(result.current.currentTripId).toBe(null);
  });

  it('prefetchTrip switches the current trip via a plain GET, never a command', async () => {
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }));
      if (url === '/api/trips/trip-b') return Promise.resolve(jsonResponse(tripView('trip-b', { lifecycle: { stage: 'planning', status: 'free', active_agent: 'guide', selected_option: null } })));
      return Promise.resolve(jsonResponse({}));
    });

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    let outcome;
    await act(async () => { outcome = await result.current.prefetchTrip('trip-b'); });

    expect(outcome.ok).toBe(true);
    const bGet = fetchMock.mock.calls.find(([u]) => u === '/api/trips/trip-b');
    expect(bGet[1]?.method).toBeUndefined();
    expect(result.current.currentTripId).toBe('trip-b');
    await waitFor(() => expect(result.current.commandSnapshot.lifecycle.stage).toBe('planning'));
  });

  it('prefetchTrip does not re-fetch a trip already warm in cache', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-b')] }));
      return Promise.resolve(jsonResponse(tripView('trip-b')));
    });

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.prefetchTrip('trip-b'); });
    const after = fetchMock.mock.calls.length;
    await act(async () => { await result.current.prefetchTrip('trip-b'); });
    expect(fetchMock.mock.calls.length).toBe(after);
  });

  it('renameTrip renames a non-current trip without switching currentTripId', async () => {
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }));
      if (url === '/api/trips/trip-b' && options?.method === 'PATCH') return Promise.resolve(jsonResponse(tripView('trip-b', { title: 'Goa', version: 2 })));
      return Promise.resolve(jsonResponse(tripView('trip-a')));
    });

    const { result } = renderHook(() => useTripAndList(), { wrapper });
    await waitFor(() => expect(result.current.currentTripId).toBe('trip-a'));

    await act(async () => { await result.current.renameTrip('trip-b', 'Goa'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-b', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Goa' }),
    }));
    expect(result.current.currentTripId).toBe('trip-a');
    await waitFor(() => expect(result.current.tripsList.find(t => t.id === 'trip-b').title).toBe('Goa'));
  });

  it('prefetchTrip fails closed on a 404 (TWM-109)', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }));
      if (url === '/api/trips/trip-b') return Promise.resolve(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
      return Promise.resolve(jsonResponse({}));
    });

    const { result } = renderHook(() => useTripAndList(), { wrapper });
    await waitFor(() => expect(result.current.tripsList.length).toBe(2));

    let outcome;
    await act(async () => { outcome = await result.current.prefetchTrip('trip-b'); });
    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    await waitFor(() => expect(result.current.tripsList.map(t => t.id)).toEqual(['trip-a']));
  });

  it('renameTrip fails closed on a 404 (TWM-109)', async () => {
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [listItem('trip-a'), listItem('trip-b')] }));
      if (url === '/api/trips/trip-b' && options?.method === 'PATCH') return Promise.resolve(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
      return Promise.resolve(jsonResponse(tripView('trip-b')));
    });

    const { result } = renderHook(() => useTripAndList(), { wrapper });
    await waitFor(() => expect(result.current.tripsList.length).toBe(2));

    let outcome;
    await act(async () => { outcome = await result.current.renameTrip('trip-b', 'Goa'); });
    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    await waitFor(() => expect(result.current.tripsList.map(t => t.id)).toEqual(['trip-a']));
  });

  it('retryTripLoad refetches the list after a failure', async () => {
    let attempt = 0;
    fetchMock.mockImplementation((url) => {
      if (url !== '/api/trips') return Promise.resolve(jsonResponse({}));
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('Network request failed'))
        : Promise.resolve(jsonResponse({ trips: [listItem('trip-a')] }));
    });

    const { result } = renderHook(() => useTripAndList(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('error'));

    await act(async () => { await result.current.retryTripLoad(); });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.tripsList.map(t => t.id)).toEqual(['trip-a']);
  });
});
