import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createTrip, getTrip, listTrips, mergeCommandTripRecord, newIdempotencyKey, queueTripMutation,
  renameTrip as renameTripApi, saveUiState as saveUiStateApi, sendTripCommand as sendTripCommandApi, TripApiError,
} from '../lib/tripApi.js';
import {
  fetchCurrentUser, login as loginApi, logout as logoutApi, signup as signupApi,
} from '../lib/authApi.js';

const TripContext = createContext(null);

// Mock trip content only (destination, places, days, plan...) — this is not
// canonical TripState. It has no Backend home yet (Destinations/Guide/Atlas
// commands land later in TWM-104/106/107), so it lives only in memory for
// this session and does not survive a refresh — canonical trip state (see
// currentTripId/commandSnapshot below) is Backend-owned and Postgres-backed.
const DEFAULT_TRIP = {
  destination: null,   // { type: 'single' | 'circuit', name, places: [string] | null } — selected matcher option
  origin: '',
  budget: 'flexible',
  style: '',   // free-text trip goal, e.g. "slow, relaxing, good food"
  travelers: 2,
  month: 'flexible',
  tripLength: 3,   // number of days, either entered directly or derived from start/end dates
  places: [],   // [{ id, name, note }]
  days: [],     // [{ day, title, items: [{ id, text }] }]
  guidePlan: null,     // authoritative mock Guide draft used by TWM-105
  guideSnapshot: null, // frozen PLAN_APPROVED handoff consumed by TWM-107
  atlasState: null,    // Atlas-shaped itinerary, versions, logistics and Dashboard state
  tripType: 'round',    // 'round' | 'one-way'
  departDate: '',       // ISO date string, e.g. '2026-11-14'
  returnDate: '',       // ISO date string, only used when tripType === 'round'
  travelMode: null,   // { id, mode, label, price, details } — selected travel option
  hotel: null,        // { id, name, price } — selected or uploaded
  bookingUploaded: false,
  plan: 'self-led',   // 'self-led' | 'twm-led' — TWM-Led is not yet available, so this is the only real option
  paid: false,
};

// Guest-first (TWM-140): every visitor starts as an anonymous guest with a
// working session; login is an explicit upgrade, never a precondition.
const DEFAULT_AUTH = { loggedIn: false, isGuest: true, name: 'Guest', email: '' };

// Backend accounts have no separate display-name concept (TWM-178's User
// model is email + password only) — `name` mirrors `email` for the
// existing "Signed in as {name}" surfaces rather than inventing one.
function authFromUser(user) {
  return user ? { loggedIn: true, isGuest: false, name: user.email, email: user.email } : DEFAULT_AUTH;
}

export function TripProvider({ children }) {
  const [trip, setTrip] = useState(DEFAULT_TRIP);
  const [auth, setAuth] = useState(DEFAULT_AUTH);
  const [commandSnapshot, setCommandSnapshot] = useState(null);
  // Login is a global overlay (TWM-164), not a routed page — any screen can
  // open it via openLoginModal() and the traveler stays exactly where they
  // were once it closes, so no "return to" route tracking is needed.
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const openLoginModal = () => setLoginModalOpen(true);
  const closeLoginModal = () => setLoginModalOpen(false);

  // Backend-authoritative trip record (id/title/version + guest session cookie).
  // Does not carry the mock trip content above — see TWM-102/TWM-110 split.
  const [tripRecord, setTripRecord] = useState(null);
  // All of the guest's Backend-owned trip records (TWM-108) — used by the
  // adaptive landing resolver and My Trips. tripRecord/commandSnapshot above
  // remain the single "current" trip that pages read/mutate.
  const [trips, setTrips] = useState([]);
  const [tripLoadStatus, setTripLoadStatus] = useState('idle'); // idle | loading | ready | error
  const [tripLoadError, setTripLoadError] = useState(null);
  // One-time "your guest trips are now saved" moment (TWM-179/180) — set
  // after a signup/login response that actually reassigned trips, cleared
  // once the traveler dismisses it.
  const [claimNotice, setClaimNotice] = useState(null);
  const ensureTripPromise = useRef(null);
  const bootPromiseRef = useRef(null);
  const tripRecordRef = useRef(null);
  useEffect(() => { tripRecordRef.current = tripRecord; }, [tripRecord]);

  // Updates tripRecordRef synchronously alongside the React state update —
  // a plain setTripRecord() only lands in tripRecordRef via the effect
  // above, which runs after render. A command that fires immediately after
  // another resolves can then read a stale ref and send an outdated
  // expected_version, causing a spurious 409 even though nothing actually
  // raced on the Backend.
  function updateTripRecord(next) {
    tripRecordRef.current = next;
    setTripRecord(next);
  }

  // Lists the guest's existing Backend trips only — never creates one. A
  // Backend trip record must not exist until the traveler's first message
  // (see ensureTrip below), so a guest with zero trips stays that way here.
  async function loadTripsNow() {
    setTripLoadStatus('loading');
    setTripLoadError(null);
    try {
      const records = await listTrips();
      const record = records[0] ?? null;
      setTrips(records);
      updateTripRecord(record);
      // The Backend-fetched record is the freshest truth for this trip's
      // state, so it must also become the readable commandSnapshot — pages
      // (e.g. Destinations) that resume mid-flow read commandSnapshot only,
      // and would otherwise see nothing until the next command response.
      setCommandSnapshot(record);
      setTripLoadStatus('ready');
      return record;
    } catch (error) {
      setTripLoadStatus('error');
      setTripLoadError(error instanceof TripApiError ? error : new TripApiError('Trip persistence is unavailable.'));
      // A failed refresh must not leave `trips` looking current — fail
      // closed (empty list) rather than silently rendering stale trips.
      setTrips([]);
      throw error;
    }
  }

  // Idempotent: a page's own effect (e.g. auto-firing discover_entry) can
  // mount and race ensureTrip() below before this component's own boot
  // effect has run — React fires child effects before parent effects in the
  // same commit — so whichever caller gets here first must be the one that
  // actually starts the list call; the other reuses the same promise.
  function ensureBootStarted() {
    if (!bootPromiseRef.current) {
      bootPromiseRef.current = loadTripsNow().catch(() => {});
    }
    return bootPromiseRef.current;
  }

  // Real session check (TWM-180): a valid JWT cookie survives a refresh,
  // so `auth` must be derived from the Backend, not reconstructed from
  // nothing on every mount. Runs alongside the guest trip-list boot load,
  // not blocking on it — an authenticated GET /trips already resolves by
  // the JWT server-side regardless of which of these two finishes first.
  async function checkSession() {
    try {
      const user = await fetchCurrentUser();
      setAuth(authFromUser(user));
    } catch {
      // Infrastructure failure checking the session — fail closed to
      // guest rather than claim a login that couldn't be confirmed.
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

  // Guarantees a Backend trip record exists before a mutation that needs
  // one — this is the only place a trip is ever created on demand, so the
  // first call a traveler makes (their first chat message, or an explicit
  // "+ New Trip"/entry action) is what actually creates the Backend record.
  // Serialized so concurrent callers await the same in-flight attempt.
  function ensureTrip() {
    if (tripRecordRef.current) return Promise.resolve(tripRecordRef.current);
    if (!ensureTripPromise.current) {
      ensureTripPromise.current = (async () => {
        // Wait for the initial trips list so we don't race a fresh create
        // against an existing trip the boot load is still fetching.
        await ensureBootStarted();
        if (tripRecordRef.current) return tripRecordRef.current;
        const created = await createTrip();
        setTrips(prev => [created, ...prev]);
        updateTripRecord(created);
        setCommandSnapshot(created);
        return created;
      })().finally(() => {
        ensureTripPromise.current = null;
      });
    }
    return ensureTripPromise.current;
  }

  // Merges a patch into the Backend-persisted, per-trip ui_state (e.g. which
  // recommendation card is expanded) — small presentation state that should
  // survive a refresh but has no place in canonical TripState.
  async function updateUiState(patch) {
    const record = await ensureTrip();
    return queueTripMutation(record.id, async () => {
      const current = tripRecordRef.current || record;
      const nextUiState = { ...current.ui_state, ...patch };
      try {
        const saved = await saveUiStateApi(current.id, nextUiState, current.version);
        updateTripRecord(saved);
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(current.id);
          updateTripRecord(latest);
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
        updateTripRecord(saved);
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(record.id);
          updateTripRecord(latest);
        }
        throw error;
      }
    });
  }

  // Drops a trip that turned out to be gone (404 — deleted, or belongs to a
  // different guest session) from the locally held list, and clears it as
  // current if it was. TWM-109: fail closed instead of leaving a phantom card.
  function dropUnavailableTrip(id) {
    setTrips(prev => prev.filter(t => t.id !== id));
    if (id === tripRecordRef.current?.id) {
      updateTripRecord(null);
      setCommandSnapshot(null);
    }
  }

  // Renames any trip from `trips` (e.g. a My Trips card), not just the
  // current one. Returns { ok: true, record } on success, or
  // { ok: false, reason: 'not_found' } for a 404 (TWM-109) instead of
  // throwing uncaught — the caller renders a clean "unavailable" outcome.
  // Falls back to a fresh fetch on a stale-version conflict (still rethrown,
  // since that's a retryable edit conflict, not a gone trip).
  async function renameTrip(id, title) {
    const target = trips.find(t => t.id === id);
    if (!target) return { ok: false, reason: 'not_found' };
    return queueTripMutation(id, async () => {
      try {
        const saved = await renameTripApi(id, title, target.version);
        setTrips(prev => prev.map(t => (t.id === id ? saved : t)));
        if (id === tripRecordRef.current?.id) {
          updateTripRecord(saved);
          setCommandSnapshot(saved);
        }
        return { ok: true, record: saved };
      } catch (error) {
        if (error instanceof TripApiError && error.status === 404) {
          dropUnavailableTrip(id);
          return { ok: false, reason: 'not_found' };
        }
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(id);
          setTrips(prev => prev.map(t => (t.id === id ? latest : t)));
        }
        throw error;
      }
    });
  }

  // Switches the current trip (e.g. opening a My Trips card) without
  // mutating stage/active_agent — a plain read, never a command. Returns
  // { ok: true, record } on success, or { ok: false, reason: 'not_found' }
  // for a 404 (TWM-109) instead of throwing uncaught.
  async function openTrip(id) {
    if (id === tripRecordRef.current?.id) return { ok: true, record: tripRecordRef.current };
    try {
      const record = await getTrip(id);
      updateTripRecord(record);
      setCommandSnapshot(record);
      setTrips(prev => (prev.some(t => t.id === id) ? prev.map(t => (t.id === id ? record : t)) : [...prev, record]));
      return { ok: true, record };
    } catch (error) {
      if (error instanceof TripApiError && error.status === 404) {
        dropUnavailableTrip(id);
        return { ok: false, reason: 'not_found' };
      }
      throw error;
    }
  }

  // The single browser mutation boundary (TWM-110): POST /api/trips/{id}/commands.
  // Every entry path (Advice/Discover/Known Destination) and every follow-up
  // traveler message goes through here — React never sends canonical TripState.
  async function sendTripCommand(command, { message, optionId, destination, tripContext, refinement, logisticsConfirmation, idempotencyKey } = {}) {
    const record = await ensureTrip();
    return queueTripMutation(record.id, async () => {
      const current = tripRecordRef.current || record;
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
      if (logisticsConfirmation !== undefined) payload.logistics_confirmation = logisticsConfirmation;
      try {
        const response = await sendTripCommandApi(current.id, payload);
        // A command response only carries the trip_state branches this turn
        // touched (TWM-154) — merge onto the last-known record instead of
        // replacing it wholesale, so an untouched branch (e.g. planner_state
        // after a confirm_logistics call) doesn't disappear client-side.
        // Merging against tripRecordRef.current (not the React `prev` from a
        // setState updater) and writing through updateTripRecord keeps the
        // ref itself current in this same tick — otherwise a follow-up
        // command fired immediately after this one resolves reads a stale
        // ref and sends a stale expected_version, causing a spurious 409.
        const merged = mergeCommandTripRecord(tripRecordRef.current, response.trip);
        updateTripRecord(merged);
        setCommandSnapshot(prev => mergeCommandTripRecord(prev, response.trip));
        return response;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(current.id);
          updateTripRecord(latest);
        }
        throw error;
      }
    });
  }

  function updateTrip(patch) {
    setTrip(prev => ({ ...prev, ...patch }));
  }

  // Starts a genuinely separate Backend-owned journey (TWM-108) — previously
  // this only reset the local mock content object and left the Backend
  // record untouched, so "+ New Trip" pointed straight back at the trip the
  // traveler was just looking at. Fixed that without going back to eagerly
  // POSTing on click: this only clears the local "current trip" pointer, so
  // ensureTrip() creates the fresh Backend record lazily on the traveler's
  // first message on the new journey — same as every other entry point.
  function startNewTrip() {
    updateTripRecord(null);
    setCommandSnapshot(null);
    setTrip(DEFAULT_TRIP);
  }

  // Signup does not auto-login server-side (TWM-178: a deliberate separate
  // step, matching this form's own two-step signup→login shape) — chaining
  // an explicit login here with the same credentials is what actually logs
  // the traveler in per this story's own acceptance criteria. Any guest
  // trips get reassigned during the signup call itself (TWM-179), so the
  // claim count comes from that first response — the login call that
  // follows finds nothing left to claim and correctly reports 0.
  async function signup(email, password) {
    const signupResult = await signupApi(email, password);
    const loginResult = await loginApi(email, password);
    setAuth(authFromUser(loginResult));
    if (signupResult.claimed_trip_count > 0) setClaimNotice({ count: signupResult.claimed_trip_count });
    await loadTripsNow().catch(() => {});
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

  // Clears the real session cookie server-side (TWM-180) — logging out no
  // longer just resets in-memory state, so a subsequent refresh actually
  // stays logged out instead of silently restoring via a still-valid cookie.
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

  // Test-only: seeds `auth` directly, bypassing the real signup/login
  // network calls entirely. Used by the test suite's SeedAuth fixture to
  // establish a pre-authenticated session without mocking a full
  // signup/login round trip — never called from product code.
  function setAuthDirect(nextAuth) {
    setAuth(nextAuth);
  }

  // Updates contact details without changing loggedIn/isGuest — used where a
  // form (e.g. request-quote) collects name/email but isn't a login action.
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
      commandSnapshot, sendTripCommand,
      currentTripId: tripRecord?.id ?? null, tripLoadStatus, tripLoadError, retryTripLoad, renameCurrentTrip,
      trips, openTrip, renameTrip,
      uiState: tripRecord?.ui_state ?? {}, updateUiState,
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within a TripProvider');
  return ctx;
}
