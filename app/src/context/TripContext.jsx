import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getTrip, listTrips, newIdempotencyKey, queueTripMutation,
  renameTrip as renameTripApi, saveUiState as saveUiStateApi, sendTripCommand as sendTripCommandApi,
  startTripFromFirstMessage, TripApiError,
} from '../lib/tripApi.js';
import {
  fetchCurrentUser, login as loginApi, logout as logoutApi, signup as signupApi,
} from '../lib/authApi.js';
import { TRIP_ID_PARAM } from '../lib/tripUrl.js';

const TripContext = createContext(null);

// Mock trip content only (destination, places, days, plan...) — this is not
// canonical TripState. It has no Backend home yet, so it lives only in
// memory for this session — canonical trip state is Backend-owned and
// composed into the `TripView` that `currentTrip` below holds.
const DEFAULT_TRIP = {
  destination: null,
  origin: '',
  budget: 'flexible',
  style: '',
  travelers: 2,
  month: 'flexible',
  tripLength: 3,
  places: [],
  days: [],
  guidePlan: null,
  guideSnapshot: null,
  atlasState: null,
  tripType: 'round',
  departDate: '',
  returnDate: '',
  travelMode: null,
  hotel: null,
  bookingUploaded: false,
  plan: 'self-led',
  paid: false,
};

// Guest-first (TWM-140): every visitor starts as an anonymous guest with a
// working session; login is an explicit upgrade, never a precondition.
const DEFAULT_AUTH = { loggedIn: false, isGuest: true, name: 'Guest', email: '' };

function authFromUser(user) {
  return user ? { loggedIn: true, isGuest: false, name: user.email, email: user.email } : DEFAULT_AUTH;
}

export function TripProvider({ children }) {
  const location = useLocation();
  const bootUrlTripIdRef = useRef(new URLSearchParams(location.search).get(TRIP_ID_PARAM));

  const [trip, setTrip] = useState(DEFAULT_TRIP);
  const [auth, setAuth] = useState(DEFAULT_AUTH);
  // TWM-220: `currentTrip` is the composed `TripView` (from GET /trips/{id})
  // once a page has opened one, or the thin `TripListItem` from the boot
  // list load before that. Both carry `lifecycle` / `context_recap`; only
  // the full TripView carries `plan` / `summary` / `matcher` / `booking`.
  // Exposed as `commandSnapshot` for continuity with the pages that read it.
  const [currentTrip, setCurrentTrip] = useState(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const openLoginModal = () => setLoginModalOpen(true);
  const closeLoginModal = () => setLoginModalOpen(false);

  // All of the guest's trips (thin TripListItem shape) — used by the
  // adaptive landing resolver and My Trips.
  const [trips, setTrips] = useState([]);
  const [tripLoadStatus, setTripLoadStatus] = useState('idle'); // idle | loading | ready | error
  const [tripLoadError, setTripLoadError] = useState(null);
  const [claimNotice, setClaimNotice] = useState(null);
  const ensureTripPromise = useRef(null);
  const bootPromiseRef = useRef(null);
  const currentTripRef = useRef(null);
  useEffect(() => { currentTripRef.current = currentTrip; }, [currentTrip]);
  // Whether currentTripRef.current is a full TripView (from getTrip) vs. the
  // boot list's thin TripListItem.
  const currentIsFullRef = useRef(false);
  const [tripDetailFull, setTripDetailFull] = useState(false);
  function setCurrent(next, { full }) {
    currentTripRef.current = next;
    currentIsFullRef.current = full;
    setCurrentTrip(next);
    setTripDetailFull(full);
  }

  async function loadTripsNow() {
    setTripLoadStatus('loading');
    setTripLoadError(null);
    try {
      const records = await listTrips();
      const urlTripId = bootUrlTripIdRef.current;
      const record = (urlTripId && records.find(r => r.id === urlTripId)) || records[0] || null;
      setTrips(records);
      setCurrent(record, { full: false });
      setTripLoadStatus('ready');
      return record;
    } catch (error) {
      setTripLoadStatus('error');
      setTripLoadError(error instanceof TripApiError ? error : new TripApiError('Trip persistence is unavailable.'));
      setTrips([]);
      throw error;
    }
  }

  function ensureBootStarted() {
    if (!bootPromiseRef.current) {
      bootPromiseRef.current = loadTripsNow().catch(() => {});
    }
    return bootPromiseRef.current;
  }

  async function checkSession() {
    try {
      const user = await fetchCurrentUser();
      setAuth(authFromUser(user));
    } catch {
      setAuth(DEFAULT_AUTH);
    }
  }

  useEffect(() => {
    ensureBootStarted();
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retryTripLoad() {
    const promise = loadTripsNow().catch(() => {});
    bootPromiseRef.current = promise;
    return promise;
  }

  // Returns the current trip (thin or full). TWM-189: a trip is never
  // created bare on demand — only startTrip() creates one, driven by the
  // traveler's first message.
  function ensureTrip() {
    if (currentTripRef.current) return Promise.resolve(currentTripRef.current);
    if (!ensureTripPromise.current) {
      ensureTripPromise.current = (async () => {
        await ensureBootStarted();
        if (currentTripRef.current) return currentTripRef.current;
        throw new Error('No trip exists yet — send a first message via startTrip() first.');
      })().finally(() => {
        ensureTripPromise.current = null;
      });
    }
    return ensureTripPromise.current;
  }

  // TWM-189: the only place a trip is created — runs the traveler's first
  // message, then fetches the composed TripView for the new row.
  async function startTrip({ entryIntent, message, title } = {}) {
    const response = await startTripFromFirstMessage({ entryIntent, message, title });
    const view = await getTrip(response.tripId);
    setTrips(prev => [toListItem(view), ...prev.filter(t => t.id !== view.id)]);
    setCurrent(view, { full: true });
    return { message: response.message, agent_meta: response.agent_meta, recommendation: response.recommendation, trip: view };
  }

  async function updateUiState(patch) {
    const record = await ensureTrip();
    return queueTripMutation(record.id, async () => {
      const current = currentTripRef.current || record;
      const nextUiState = { ...(current.ui_state || {}), ...patch };
      try {
        const saved = await saveUiStateApi(current.id, nextUiState, current.version);
        setCurrent(saved, { full: true });
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          setCurrent(await getTrip(current.id), { full: true });
        }
        throw error;
      }
    });
  }

  async function renameCurrentTrip(title) {
    const record = await ensureTrip();
    return queueTripMutation(record.id, async () => {
      try {
        const saved = await renameTripApi(record.id, title, record.version);
        setCurrent(saved, { full: true });
        setTrips(prev => prev.map(t => (t.id === saved.id ? toListItem(saved) : t)));
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          setCurrent(await getTrip(record.id), { full: true });
        }
        throw error;
      }
    });
  }

  function dropUnavailableTrip(id) {
    setTrips(prev => prev.filter(t => t.id !== id));
    if (id === currentTripRef.current?.id) {
      setCurrent(null, { full: false });
    }
  }

  async function renameTrip(id, title) {
    const target = trips.find(t => t.id === id);
    if (!target) return { ok: false, reason: 'not_found' };
    return queueTripMutation(id, async () => {
      try {
        const saved = await renameTripApi(id, title, target.version);
        setTrips(prev => prev.map(t => (t.id === id ? toListItem(saved) : t)));
        if (id === currentTripRef.current?.id) setCurrent(saved, { full: true });
        return { ok: true, record: saved };
      } catch (error) {
        if (error instanceof TripApiError && error.status === 404) {
          dropUnavailableTrip(id);
          return { ok: false, reason: 'not_found' };
        }
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(id);
          setTrips(prev => prev.map(t => (t.id === id ? toListItem(latest) : t)));
        }
        throw error;
      }
    });
  }

  // Switches the current trip to a fully composed TripView. A plain read,
  // never a command — never mutates stage/active_agent.
  async function openTrip(id) {
    if (id === currentTripRef.current?.id && currentIsFullRef.current) {
      return { ok: true, record: currentTripRef.current };
    }
    try {
      const view = await getTrip(id);
      setCurrent(view, { full: true });
      setTrips(prev => (prev.some(t => t.id === id) ? prev.map(t => (t.id === id ? toListItem(view) : t)) : [...prev, toListItem(view)]));
      return { ok: true, record: view };
    } catch (error) {
      if (error instanceof TripApiError && error.status === 404) {
        dropUnavailableTrip(id);
        return { ok: false, reason: 'not_found' };
      }
      throw error;
    }
  }

  // TWM-220: `get_trip_core` (the composed TripView's read) is blob-free and
  // cheap now, so there is no separate cheap "cache-first" render path — the
  // dashboard's first paint is one `GET /trips/{id}`. Kept as a named alias
  // so call sites (DashboardHome, TripDashboard) stay put.
  function viewTrip(id) {
    return openTrip(id);
  }

  // The single browser mutation boundary: POST /api/trips/{id}/commands.
  // TWM-220: the command response carries only the touched trip_state
  // branches; we re-fetch the composed TripView rather than merge that shape
  // client-side. The response's own `message` / `agent_meta` /
  // `recommendation` are returned alongside the fresh view.
  async function sendTripCommand(command, { message, optionId, destination, tripContext, refinement, partyUpdate, searchPrefUpdate, searchPrefClear, idempotencyKey } = {}) {
    const record = await ensureTrip();
    return queueTripMutation(record.id, async () => {
      const current = currentTripRef.current || record;
      const payload = {
        command,
        expected_version: current.version,
        idempotency_key: idempotencyKey || newIdempotencyKey(),
      };
      if (message !== undefined) payload.message = message;
      if (optionId !== undefined) payload.option_id = optionId;
      if (destination !== undefined) payload.destination = destination;
      if (tripContext !== undefined) payload.trip_context = tripContext;
      if (refinement !== undefined) payload.refinement = refinement;
      if (partyUpdate !== undefined) payload.party_update = partyUpdate;
      if (searchPrefUpdate !== undefined) payload.search_pref_update = searchPrefUpdate;
      if (searchPrefClear !== undefined) payload.search_pref_clear = searchPrefClear;
      try {
        const response = await sendTripCommandApi(current.id, payload);
        const view = await getTrip(current.id);
        setCurrent(view, { full: true });
        setTrips(prev => prev.map(t => (t.id === view.id ? toListItem(view) : t)));
        return {
          message: response.message,
          agent_meta: response.agent_meta,
          recommendation: response.recommendation,
          trip: view,
        };
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          setCurrent(await getTrip(current.id), { full: true });
        }
        throw error;
      }
    });
  }

  function updateTrip(patch) {
    setTrip(prev => ({ ...prev, ...patch }));
  }

  function startNewTrip() {
    setCurrent(null, { full: false });
    setTrip(DEFAULT_TRIP);
  }

  async function signup(email, password) {
    const signupResult = await signupApi(email, password);
    if (signupResult.claimed_trip_count > 0) setClaimNotice({ count: signupResult.claimed_trip_count });
    return signupResult;
  }

  async function login(email, password) {
    const result = await loginApi(email, password);
    setAuth(authFromUser(result));
    if (result.claimed_trip_count > 0) setClaimNotice({ count: result.claimed_trip_count });
    await loadTripsNow().catch(() => {});
    return result;
  }

  function continueWithoutLogin() {
    setAuth(DEFAULT_AUTH);
  }

  async function logout() {
    try {
      await logoutApi();
    } finally {
      setAuth(DEFAULT_AUTH);
      await loadTripsNow().catch(() => {});
    }
  }

  function dismissClaimNotice() {
    setClaimNotice(null);
  }

  function setAuthDirect(nextAuth) {
    setAuth(nextAuth);
  }

  function setContact({ name, email }) {
    setAuth(prev => ({ ...prev, name, email }));
  }

  const hasAccess = auth.loggedIn || auth.isGuest;

  return (
    <TripContext.Provider value={{
      trip, updateTrip, startNewTrip, auth, hasAccess, signup, login, continueWithoutLogin, logout, setContact,
      setAuthDirect,
      loginModalOpen, openLoginModal, closeLoginModal,
      claimNotice, dismissClaimNotice,
      commandSnapshot: currentTrip, sendTripCommand, startTrip,
      currentTripId: currentTrip?.id ?? null, tripLoadStatus, tripLoadError, retryTripLoad, renameCurrentTrip,
      trips, openTrip, viewTrip, tripDetailFull, renameTrip,
      uiState: currentTrip?.ui_state ?? {}, updateUiState,
    }}>
      {children}
    </TripContext.Provider>
  );
}

// A composed TripView carries everything a TripListItem does plus more —
// project it down so `trips` stays list-shaped after a full fetch/rename.
function toListItem(view) {
  return {
    id: view.id,
    title: view.title,
    product_mode: view.product_mode,
    version: view.version,
    created_at: view.created_at ?? null,
    updated_at: view.updated_at ?? new Date().toISOString(),
    lifecycle: view.lifecycle,
    context_recap: view.context_recap ?? [],
    travel_window: view.travel_window ?? deriveTravelWindow(view),
    has_places: (view.plan?.places?.length || 0) > 0,
    has_day_plan: (view.plan?.day_plan?.length || 0) > 0,
    has_itinerary: view.summary != null,
    awaiting: view.plan?.awaiting ?? null,
    has_recommendation: !!view.matcher?.has_recommendation,
  };
}

function deriveTravelWindow(view) {
  const dates = view.summary?.dates;
  if (!dates || dates.precision === 'none') return null;
  return { precision: dates.precision, departure: dates.departure ?? null, month: dates.month ?? null };
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within a TripProvider');
  return ctx;
}
