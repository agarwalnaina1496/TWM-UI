import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createTrip, getTrip, listTrips, newIdempotencyKey, queueTripMutation,
  renameTrip as renameTripApi, saveUiState as saveUiStateApi, sendTripCommand as sendTripCommandApi, TripApiError,
} from '../lib/tripApi.js';

const TripContext = createContext(null);

// Mock trip content only (destination, places, days, plan...) — this is not
// canonical TripState. TWM-110 wired entry/advice commands, but this content
// still has no Backend home (Destinations/Guide/Atlas commands land later in
// TWM-104/106/107), so it stays cached here to avoid losing demo progress on
// refresh. See currentTripId below for the Backend-authoritative trip record
// (id/title/version), which TWM-102 owns.
const STORAGE_KEY = 'twm_prototype_state_v1';

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

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function TripProvider({ children }) {
  const stored = loadStored();
  const [trip, setTrip] = useState({ ...DEFAULT_TRIP, ...stored?.trip });
  const [auth, setAuth] = useState(stored?.auth ?? DEFAULT_AUTH);
  const [commandSnapshot, setCommandSnapshot] = useState(stored?.commandSnapshot ?? null);
  // In-app route to return to after an explicit login action (TWM-140
  // contextual auth invitation). Only ever set from internal route strings
  // (useLocation().pathname) — never from external input — so it can't be
  // used as an open redirect.
  const [pendingReturnTo, setPendingReturnTo] = useState(null);

  // Backend-authoritative trip record (id/title/version + guest session cookie).
  // Does not carry the mock trip content above — see TWM-102/TWM-110 split.
  const [tripRecord, setTripRecord] = useState(null);
  // All of the guest's Backend-owned trip records (TWM-108) — used by the
  // adaptive landing resolver and My Trips. tripRecord/commandSnapshot above
  // remain the single "current" trip that pages read/mutate.
  const [trips, setTrips] = useState([]);
  const [tripLoadStatus, setTripLoadStatus] = useState('idle'); // idle | loading | ready | error
  const [tripLoadError, setTripLoadError] = useState(null);
  const ensureTripPromise = useRef(null);
  const tripRecordRef = useRef(null);
  useEffect(() => { tripRecordRef.current = tripRecord; }, [tripRecord]);

  async function loadOrCreateTripNow() {
    setTripLoadStatus('loading');
    setTripLoadError(null);
    try {
      const records = await listTrips();
      const record = records[0] ?? await createTrip();
      setTrips(records.length ? records : [record]);
      setTripRecord(record);
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

  // Dedupes concurrent boot/ensureTrip callers against the same in-flight load.
  function loadOrCreateTrip() {
    if (!ensureTripPromise.current) {
      ensureTripPromise.current = loadOrCreateTripNow().finally(() => {
        ensureTripPromise.current = null;
      });
    }
    return ensureTripPromise.current;
  }

  useEffect(() => {
    loadOrCreateTrip().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retryTripLoad() {
    return loadOrCreateTrip().catch(() => {});
  }

  // Guarantees a Backend trip record exists before a mutation that needs one,
  // serialized so concurrent callers await the same in-flight attempt.
  function ensureTrip() {
    if (tripRecord) return Promise.resolve(tripRecord);
    return loadOrCreateTrip();
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
        setTripRecord(saved);
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(current.id);
          setTripRecord(latest);
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
        setTripRecord(saved);
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(record.id);
          setTripRecord(latest);
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
      setTripRecord(null);
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
          setTripRecord(saved);
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
      setTripRecord(record);
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
  async function sendTripCommand(command, { message, optionId, destination, refinement, logisticsConfirmation, idempotencyKey } = {}) {
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
      if (refinement !== undefined) payload.refinement = refinement;
      if (logisticsConfirmation !== undefined) payload.logistics_confirmation = logisticsConfirmation;
      try {
        const response = await sendTripCommandApi(current.id, payload);
        setTripRecord(response.trip);
        setCommandSnapshot(response.trip);
        return response;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) {
          const latest = await getTrip(current.id);
          setTripRecord(latest);
        }
        throw error;
      }
    });
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, auth, commandSnapshot }));
    } catch {
      // Storage unavailable (private browsing, quota, etc.) — prototype state just won't survive a reload.
    }
  }, [trip, auth, commandSnapshot]);

  function updateTrip(patch) {
    setTrip(prev => ({ ...prev, ...patch }));
  }

  // Starts a genuinely separate Backend-owned journey (TWM-108) — previously
  // this only reset the local mock content object and left the Backend
  // record untouched, so "+ New Trip" was a no-op against saved trips.
  async function startNewTrip() {
    const created = await createTrip();
    setTrips(prev => [created, ...prev]);
    setTripRecord(created);
    setCommandSnapshot(created);
    setTrip(DEFAULT_TRIP);
    return created;
  }

  function login({ name, email }) {
    setAuth({ loggedIn: true, isGuest: false, name, email });
  }

  function continueWithoutLogin() {
    setAuth({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
  }

  function logout() {
    setAuth(DEFAULT_AUTH);
  }

  // Updates contact details without changing loggedIn/isGuest — used where a
  // form (e.g. request-quote) collects name/email but isn't a login action.
  function setContact({ name, email }) {
    setAuth(prev => ({ ...prev, name, email }));
  }

  const hasAccess = auth.loggedIn || auth.isGuest;

  return (
    <TripContext.Provider value={{
      trip, updateTrip, startNewTrip, auth, hasAccess, login, continueWithoutLogin, logout, setContact,
      pendingReturnTo, setPendingReturnTo,
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
