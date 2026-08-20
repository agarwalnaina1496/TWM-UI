import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';
import { mockFetchWithGuestSession } from '../testUtils.js';

// TWM-185: TripProvider now reads the boot URL's ?tripId= via useLocation(),
// so it needs a Router in scope — mirrors how it's actually mounted in the
// app (inside BrowserRouter, main.jsx).
function wrapper({ children }) {
  return <MemoryRouter><TripProvider>{children}</TripProvider></MemoryRouter>;
}

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
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

  it('login calls the real endpoint and sets loggedIn true / isGuest false from the response', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      if (url === '/api/auth/login') return Promise.resolve(jsonResponse({ id: 'u1', email: 't@example.com', claimed_trip_count: 0 }));
      return Promise.resolve(jsonResponse({ trips: [] }));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });

    await act(async () => { await result.current.login('t@example.com', 'hunter22!!'); });

    expect(result.current.auth).toEqual({ loggedIn: true, isGuest: false, name: 't@example.com', email: 't@example.com' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('login rejects with the real error and leaves auth unchanged on wrong credentials', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      if (url === '/api/auth/login') return Promise.resolve(jsonResponse({ detail: 'Incorrect email or password.' }, { status: 401 }));
      return Promise.resolve(jsonResponse({ trips: [] }));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });

    await expect(act(async () => { await result.current.login('t@example.com', 'wrong'); })).rejects.toThrow();
    expect(result.current.auth.loggedIn).toBe(false);
  });

  it('signup does not auto-login — auth stays guest and no login call is made', async () => {
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

  it('signup surfaces the real error on a duplicate email', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      if (url === '/api/auth/signup') return Promise.resolve(jsonResponse({ detail: 'Email is already registered.' }, { status: 409 }));
      return Promise.resolve(jsonResponse({ trips: [] }));
    });
    const { result } = renderHook(() => useTrip(), { wrapper });

    await expect(act(async () => { await result.current.signup('t@example.com', 'hunter22!!'); }))
      .rejects.toThrow('Email is already registered.');
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

  it('continueWithoutLogin sets isGuest true and loggedIn false', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.continueWithoutLogin());
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('logout calls the real endpoint and resets to the default anonymous-guest state, keeping access', async () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.setAuthDirect({ loggedIn: true, isGuest: false, name: 't@example.com', email: 't@example.com' }));

    await act(async () => { await result.current.logout(); });

    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('setContact updates name/email without changing loggedIn/isGuest', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.continueWithoutLogin());
    act(() => result.current.setContact({ name: 'Jane', email: 'jane@example.com' }));
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Jane', email: 'jane@example.com' });
  });

  it('keeps trip and auth in memory only — nothing survives a remount via localStorage', () => {
    const { result, unmount } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.setAuthDirect({ loggedIn: true, isGuest: false, name: 't@example.com', email: 't@example.com' }));
    act(() => result.current.updateTrip({ destination: { type: 'single', name: 'Coorg', places: null } }));
    expect(localStorage.length).toBe(0);
    unmount();

    const { result: reloaded } = renderHook(() => useTrip(), { wrapper });
    expect(reloaded.current.auth.name).toBe('Guest');
    expect(reloaded.current.trip.destination).toBe(null);
  });

  it('opens and closes the login overlay (TWM-140/164)', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    expect(result.current.loginModalOpen).toBe(false);
    act(() => result.current.openLoginModal());
    expect(result.current.loginModalOpen).toBe(true);
    act(() => result.current.closeLoginModal());
    expect(result.current.loginModalOpen).toBe(false);
  });

});

describe('TripContext Backend-authoritative trip record', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses an existing trip on boot instead of creating a new one', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [{ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {}, updated_at: '2026-01-01T00:00:00.000Z' }],
    }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not create a trip on boot when none exist yet — stays trip-less until the first message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a trip via startTrip on the traveler\'s first message (TWM-189: no bare create beforehand)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))
      .mockResolvedValueOnce(jsonResponse({
        message: 'Got it.', agent_meta: null,
        trip: { id: 'trip-new', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} },
      }, { status: 201 }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe(null);

    await act(async () => { await result.current.startTrip('discover_entry', { message: 'Plan my Coorg trip' }); });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/trips/first-message', expect.objectContaining({ method: 'POST' }));
    expect(result.current.currentTripId).toBe('trip-new');
  });

  it('sendTripCommand rejects when no trip exists yet — it never creates one itself (TWM-189)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await expect(
      act(async () => { await result.current.sendTripCommand('traveler_message', { message: 'hi' }); })
    ).rejects.toThrow('No trip exists yet');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps an untouched trip_state branch after a command response omits it (TWM-154)', async () => {
    // Backend now trims a command response to only the branches that turn
    // touched — a scout-only reply carries no planner_state at all. The
    // context must merge that onto the last-known record, not replace it.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [{
          id: 'trip-1', title: 'Untitled Trip', version: 1,
          trip_state: { stage: 'planning', active_agent: 'scout', trip_context: {}, planner_state: { frozen_plan: { guide_revision: 3 } } },
          ui_state: {}, updated_at: '2026-01-01T00:00:00.000Z',
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        message: 'Got it.',
        trip: {
          id: 'trip-1', title: 'Untitled Trip', version: 2,
          trip_state: { stage: 'planning', active_agent: 'scout', trip_context: {} },
          ui_state: {},
        },
      }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.commandSnapshot.trip_state.planner_state).toEqual({ frozen_plan: { guide_revision: 3 } });

    await act(async () => { await result.current.sendTripCommand('traveler_message', { message: 'hi' }); });

    expect(result.current.commandSnapshot.version).toBe(2);
    expect(result.current.commandSnapshot.trip_state.planner_state).toEqual({ frozen_plan: { guide_revision: 3 } });
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
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }] }))
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

  it('does not persist mock trip content (destination/places/days) to the Backend or localStorage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [{ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }],
    }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    act(() => result.current.updateTrip({ destination: { type: 'single', name: 'Coorg', places: null } }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.trip.destination).toEqual({ type: 'single', name: 'Coorg', places: null });
    expect(localStorage.length).toBe(0);
  });
});

describe('TripContext multi-trip handling (TWM-108)', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TWM-185: a hard reload/bookmark on a trip-specific route (?tripId=) must
  // land on that trip, not an arbitrary first one — the URL is the
  // traveler's actual intent here.
  it('boots to the URL-provided trip id instead of records[0] when both are available', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        { id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} },
        { id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {} },
      ],
    }));
    function wrapperWithUrlTripId({ children }) {
      return <MemoryRouter initialEntries={['/dashboard?tripId=trip-b']}><TripProvider>{children}</TripProvider></MemoryRouter>;
    }

    const { result } = renderHook(() => useTrip(), { wrapper: wrapperWithUrlTripId });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    expect(result.current.currentTripId).toBe('trip-b');
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a', 'trip-b']); // full list still kept, only "current" changes
  });

  // A stale/foreign ?tripId= (not among this guest's trips) must not leave
  // the app with no current trip at all — falls back to records[0], same as
  // when the param is absent entirely.
  it('falls back to records[0] when the URL trip id does not match any of this guest\'s trips', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [{ id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} }],
    }));
    function wrapperWithUnknownUrlTripId({ children }) {
      return <MemoryRouter initialEntries={['/dashboard?tripId=trip-does-not-exist']}><TripProvider>{children}</TripProvider></MemoryRouter>;
    }

    const { result } = renderHook(() => useTrip(), { wrapper: wrapperWithUnknownUrlTripId });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('keeps every listed trip in `trips` instead of discarding all but the first', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        { id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {}, updated_at: '2026-01-02T00:00:00.000Z' },
        { id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {}, updated_at: '2026-01-01T00:00:00.000Z' },
      ],
    }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    expect(result.current.trips.map(t => t.id)).toEqual(['trip-a', 'trip-b']);
    expect(result.current.currentTripId).toBe('trip-a');
  });

  it('startNewTrip clears the current trip locally without creating a Backend record yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1', title: 'Untitled Trip', version: 1, trip_state: {}, ui_state: {} }] }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    act(() => result.current.updateTrip({ destination: { type: 'single', name: 'Coorg', places: null } }));

    const callsBefore = fetchMock.mock.calls.length;
    act(() => { result.current.startNewTrip(); });

    // No POST yet — the Backend record is created lazily by the traveler's
    // first message on the new journey, same as every other entry point.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(result.current.currentTripId).toBe(null);
    expect(result.current.trips.map(t => t.id)).toEqual(['trip-1']);
    expect(result.current.trip.destination).toBe(null);
  });

  it('openTrip switches the current trip via a plain GET, never a command', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [
          { id: 'trip-a', title: 'A', version: 1, trip_state: { stage: 'matched' }, ui_state: {} },
          { id: 'trip-b', title: 'B', version: 1, trip_state: { stage: 'planning' }, ui_state: {} },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: { stage: 'planning' }, ui_state: {} }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.openTrip('trip-b'); });

    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-b', expect.not.objectContaining({ method: expect.anything() }));
    expect(result.current.currentTripId).toBe('trip-b');
    expect(result.current.commandSnapshot.trip_state.stage).toBe('planning');
  });

  // TWM-182 follow-up: once a genuine single-trip fetch has happened for an
  // id (not merely the boot's thin list load), re-opening the same id is
  // safe to skip — the cached record is already complete, so a second
  // openTrip call shouldn't cost another round trip.
  it('openTrip does not re-fetch when the current trip already came from a full single-trip fetch', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [
          { id: 'trip-a', title: 'A', version: 1, trip_state: { stage: 'matched' }, ui_state: {} },
          { id: 'trip-b', title: 'B', version: 1, trip_state: { stage: 'planning' }, ui_state: {} },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-b', title: 'B', version: 1, trip_state: { stage: 'planning' }, ui_state: {} }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));

    await act(async () => { await result.current.openTrip('trip-b'); });
    const callsAfterFirstOpen = fetchMock.mock.calls.length;

    await act(async () => { await result.current.openTrip('trip-b'); });

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstOpen);
    expect(result.current.currentTripId).toBe('trip-b');
  });

  // TWM-182: reproduced live — GET /api/trips (list) omits planner_state
  // entirely, while GET /api/trips/{id} (single) includes it. The boot load
  // can make a trip "current" via the thin list response alone (its stage
  // already matches tripRecordRef.current.id); openTrip on that same id must
  // still hit the full-detail endpoint, or commandSnapshot stays thin and
  // TripPreview's boot effect wrongly re-fires start_planning on an
  // already-started Guide session (Backend 422s: "Guide planning has
  // already started").
  it('openTrip always re-fetches full detail, even when the boot load already made this id current via the thin list response', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [{ id: 'trip-a', title: 'A', version: 1, trip_state: { stage: 'planning' }, ui_state: {} }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'trip-a', title: 'A', version: 1,
        trip_state: { stage: 'planning', active_agent: 'guide', planner_state: { conversation_context: { awaiting: 'trip_duration' } } },
        ui_state: {},
      }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-a');
    expect(result.current.commandSnapshot.trip_state.planner_state).toBeUndefined();

    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => { await result.current.openTrip('trip-a'); });

    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-a', expect.not.objectContaining({ method: expect.anything() }));
    expect(result.current.commandSnapshot.trip_state.planner_state.conversation_context.awaiting).toBe('trip_duration');
  });

  // TWM-182 fast-follow: reproduced live. viewTrip's original short-circuit
  // (`if (id === tripRecordRef.current?.id) return ...`) bypassed both the
  // itinerary-ready check and the background verify/upgrade whenever the id
  // merely matched — even though the boot's thin list load, not a full
  // fetch, is what made it "current". An itinerary-ready trip that happened
  // to be the boot's default current trip got stuck showing the thin track
  // board (never upgrading to the full TripDashboard), confirmed live on
  // staging.
  it('viewTrip still fires a background full fetch when the already-current trip is only thin (from the boot list load)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [{ id: 'trip-a', title: 'A', version: 1, trip_state: { stage: 'planning' }, ui_state: {} }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'trip-a', title: 'A', version: 1,
        trip_state: { stage: 'planning', planner_state: { conversation_context: { awaiting: 'trip_duration' } } },
        ui_state: {},
      }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-a');

    const callsBefore = fetchMock.mock.calls.length;
    act(() => { result.current.viewTrip('trip-a'); });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-a', expect.not.objectContaining({ method: expect.anything() }));
    await waitFor(() => expect(result.current.commandSnapshot.trip_state.planner_state?.conversation_context?.awaiting).toBe('trip_duration'));
  });

  it('viewTrip delegates to a full fetch when the already-current thin trip turns out itinerary-ready', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [{ id: 'trip-a', title: 'A', version: 1, trip_state: { stage: 'planned', itinerary_state: { status: 'ready' } }, ui_state: {} }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'trip-a', title: 'A', version: 1,
        trip_state: {
          stage: 'planned',
          planner_state: { frozen_plan: { guide_revision: 1 } },
          itinerary_state: { status: 'ready', current_version: { version: 1, source_guide_revision: 1 } },
        },
        ui_state: {},
      }));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.currentTripId).toBe('trip-a');

    let outcome;
    await act(async () => { outcome = await result.current.viewTrip('trip-a'); });

    expect(outcome.record.trip_state.planner_state.frozen_plan).toBeTruthy();
    expect(result.current.commandSnapshot.trip_state.planner_state.frozen_plan).toBeTruthy();
  });

  it('renameTrip renames a non-current trip without switching currentTripId', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [
          { id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} },
          { id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {} },
        ],
      }))
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
      .mockResolvedValueOnce(jsonResponse({
        trips: [
          { id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} },
          { id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {} },
        ],
      }))
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
      .mockResolvedValueOnce(jsonResponse({
        trips: [
          { id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} },
          { id: 'trip-b', title: 'B', version: 1, trip_state: {}, ui_state: {} },
        ],
      }))
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
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-a', title: 'A', version: 1, trip_state: {}, ui_state: {} }] }))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const { result } = renderHook(() => useTrip(), { wrapper });
    await waitFor(() => expect(result.current.tripLoadStatus).toBe('ready'));
    expect(result.current.trips).toHaveLength(1);

    await act(async () => { await result.current.retryTripLoad(); });

    await waitFor(() => expect(result.current.tripLoadStatus).toBe('error'));
    expect(result.current.trips).toEqual([]);
  });
});
