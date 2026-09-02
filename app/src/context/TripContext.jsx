import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getTrip, listTrips, mergeCommandTripRecord, newIdempotencyKey, queueTripMutation,
  renameTrip as renameTripApi, saveUiState as saveUiStateApi, sendTripCommand as sendTripCommandApi,
  startTripFromFirstMessage, TripApiError,
} from '../lib/tripApi.js';
import {
  fetchCurrentUser, login as loginApi, logout as logoutApi, signup as signupApi,
} from '../lib/authApi.js';
import { TRIP_ID_PARAM } from '../lib/tripUrl.js';

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
  // TWM-185: read once at boot time only (via a ref, not a reactive value —
  // this must never re-trigger loadTripsNow on ordinary in-app navigation,
  // only inform the very first list-load's choice of "current" trip).
  const location = useLocation();
  const bootUrlTripIdRef = useRef(new URLSearchParams(location.search).get(TRIP_ID_PARAM));

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
  // TWM-182: tracks whether tripRecordRef.current came from a genuine
  // single-trip fetch (getTrip/createTrip — always the full TripResponse
  // shape) vs. loadTripsNow's list response (TripSummary — deliberately
  // thin, missing planner_state's own day_plan/places even after the
  // Backend's TWM-182 addition of a cheap awaiting/has_day_plan/has_places
  // signal there). A command response's merge (sendTripCommand below) only
  // ever adds the branches that turn touched onto an already-complete base,
  // so it never un-sets this once a full fetch has happened for this id.
  // Mirrored into reactive state (not just the ref) so consumers like
  // TripPreview's boot effect can depend on it changing.
  const tripRecordIsFullRef = useRef(false);
  const [tripDetailFull, setTripDetailFull] = useState(false);
  function markTripDetailFull(isFull) {
    tripRecordIsFullRef.current = isFull;
    setTripDetailFull(isFull);
  }

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
      // TWM-185: a URL-provided trip id (hard reload, bookmark, shared link
      // on any of the 5 trip-specific routes) takes precedence over an
      // arbitrary first trip — that URL is the traveler's actual intent.
      // Falls through to records[0] when the id is absent or doesn't match
      // any of this guest's trips (e.g. a stale/foreign link).
      const urlTripId = bootUrlTripIdRef.current;
      const record = (urlTripId && records.find(r => r.id === urlTripId)) || records[0] || null;
      setTrips(records);
      updateTripRecord(record);
      markTripDetailFull(false);
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

  // Idempotent: a page's own effect (e.g. auto-firing startTrip) can
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

  // Waits for the boot trip-list load and returns the current Backend trip
  // record. TWM-189: a trip is never created bare on demand any more — the
  // only path that creates one is startTrip() below, driven by the
  // traveler's actual first message (JourneyEntry.jsx). Every caller here
  // (follow-up commands, rename, UI-state save) assumes a trip already
  // exists; throwing instead of silently creating one surfaces a caller
  // bug immediately rather than resurrecting an orphan-trip code path.
  // Serialized so concurrent callers await the same in-flight boot wait.
  function ensureTrip() {
    if (tripRecordRef.current) return Promise.resolve(tripRecordRef.current);
    if (!ensureTripPromise.current) {
      ensureTripPromise.current = (async () => {
        await ensureBootStarted();
        if (tripRecordRef.current) return tripRecordRef.current;
        throw new Error('No trip exists yet — send a first message via startTrip() first.');
      })().finally(() => {
        ensureTripPromise.current = null;
      });
    }
    return ensureTripPromise.current;
  }

  // TWM-189: the only place a trip is ever created — runs the traveler's
  // first message (entryIntent: 'discover' | 'known_destination') and only
  // ends up with a Backend trip record if that call succeeds, so a failure
  // never leaves an orphan trip or a local trip pointer with nothing
  // behind it. Not serialized like ensureTrip()/sendTripCommand — callers
  // (ScoutChat.jsx's fresh-entry path) already guard against a concurrent
  // second send via their own `busy` state.
  async function startTrip({ entryIntent, message, title } = {}) {
    const response = await startTripFromFirstMessage({ entryIntent, message, title });
    setTrips(prev => [response.trip, ...prev]);
    updateTripRecord(response.trip);
    markTripDetailFull(true);
    setCommandSnapshot(response.trip);
    return response;
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
  //
  // TWM-182: only short-circuits when tripRecordIsFullRef is already true for
  // this id — i.e. a genuine single-trip fetch (getTrip/createTrip) already
  // happened, not merely the boot load's list response (loadTripsNow, GET
  // /api/trips), which omits planner_state's own day_plan/places even after
  // the Backend's TWM-182 addition of a cheap awaiting/has_day_plan/
  // has_places signal there. Skipping the re-fetch whenever the id merely
  // matched used to leave commandSnapshot permanently missing planner_state
  // for a trip that became "current" via that thin list load — confirmed
  // live: TripPreview's boot effect then read no awaiting/day_plan, wrongly
  // re-fired start_planning on an already-started Guide session, and the
  // Backend correctly 422'd it.
  async function openTrip(id) {
    if (id === tripRecordRef.current?.id && tripRecordIsFullRef.current) {
      return { ok: true, record: tripRecordRef.current };
    }
    try {
      const record = await getTrip(id);
      updateTripRecord(record);
      markTripDetailFull(true);
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

  // TWM-182: the cheap counterpart to openTrip — used by DashboardHome's
  // plain "Open trip →" card, which always lands on /dashboard. Renders
  // straight from the already-cached list entry (zero network cost) instead
  // of forcing a full single-trip GET just to show the thin-state track
  // board, since GET /trips (TWM-182) now carries enough (awaiting/
  // has_day_plan/has_places, plus trip_context) for TripDashboard's
  // ThinStateDashboard to render correctly off it via dashboardTracks.js.
  //
  // Never safe for an itinerary-ready trip — the list summary has no
  // frozen_plan/itinerary result, so those still fall through to the full
  // openTrip fetch. And never used by any entry point that can navigate
  // straight into a decision-making page (ScoutChat/Destinations/
  // TripPreview) — those must always end up with a full fetch; see
  // TripDashboard.jsx's track-CTA click handler, which calls openTrip
  // before navigating regardless of how the Dashboard itself was reached.
  //
  // The cache-only render skips the one thing openTrip's round trip used to
  // guarantee for free: confirming the trip still exists server-side (TWM-109
  // — a trip deleted from another session/device). So this also kicks off a
  // background openTrip for the same id, un-awaited: on success it seamlessly
  // upgrades commandSnapshot to full detail once it arrives (nice bonus — the
  // eventual track-CTA click likely no-ops instead of waiting); on a genuine
  // 404 it already calls dropUnavailableTrip, which the Dashboard's own
  // "trip not found" branch below reacts to.
  //
  // The only early-return short-circuit is when this id is already current
  // *and* already fully fetched — confirmed live to matter: without the
  // itinerary-ready check running unconditionally (previously guarded by an
  // "already current" short-circuit that skipped it entirely), an
  // itinerary-ready trip that happened to already be the boot's default
  // current trip stayed stuck on the thin track board indefinitely, and the
  // background verify/upgrade never fired at all for that same case.
  function viewTrip(id) {
    if (id === tripRecordRef.current?.id && tripRecordIsFullRef.current) {
      return { ok: true, record: tripRecordRef.current };
    }
    const listed = trips.find(t => t.id === id) ?? (id === tripRecordRef.current?.id ? tripRecordRef.current : null);
    if (!listed || listed.trip_state?.itinerary_state?.status === 'ready') return openTrip(id);
    if (id !== tripRecordRef.current?.id) {
      updateTripRecord(listed);
      markTripDetailFull(false);
      setCommandSnapshot(listed);
    }
    openTrip(id).catch(() => {});
    return { ok: true, record: listed };
  }

  // The single browser mutation boundary (TWM-110): POST /api/trips/{id}/commands.
  // Every entry path (Advice/Discover/Known Destination) and every follow-up
  // traveler message goes through here — React never sends canonical TripState.
  async function sendTripCommand(command, { message, optionId, destination, tripContext, refinement, tripStartUpdate, partyUpdate, searchPrefUpdate, searchPrefClear, idempotencyKey } = {}) {
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
      if (tripStartUpdate !== undefined) payload.trip_start_update = tripStartUpdate;
      if (partyUpdate !== undefined) payload.party_update = partyUpdate;
      if (searchPrefUpdate !== undefined) payload.search_pref_update = searchPrefUpdate;
      if (searchPrefClear !== undefined) payload.search_pref_clear = searchPrefClear;
      try {
        const response = await sendTripCommandApi(current.id, payload);
        // A command response only carries the trip_state branches this turn
        // touched (TWM-154) — merge onto the last-known record instead of
        // replacing it wholesale, so an untouched branch (e.g. planner_state
        // after a set_trip_start call) doesn't disappear client-side.
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

  // Signup does not auto-login (TWM-178: a deliberate separate step) — the
  // traveler logs in themselves afterward via the explicit login form.
  // Guest trips already get reassigned during this signup call itself
  // (TWM-179), so the claim notice is driven by this response, not a
  // follow-up login.
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
      commandSnapshot, sendTripCommand, startTrip,
      currentTripId: tripRecord?.id ?? null, tripLoadStatus, tripLoadError, retryTripLoad, renameCurrentTrip,
      trips, openTrip, viewTrip, tripDetailFull, renameTrip,
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
