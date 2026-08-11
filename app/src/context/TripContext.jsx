import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { applyCommandSnapshot } from '../lib/mockTripCommands.js';
import { createTrip, getTrip, listTrips, queueTripMutation, renameTrip as renameTripApi, TripApiError } from '../lib/tripApi.js';

const TripContext = createContext(null);

// Mock trip content only (destination, places, days, plan...) — this is not
// canonical TripState. Real command wiring lands in TWM-110; until then this
// content has no Backend home, so it stays cached here to avoid losing demo
// progress on refresh. See currentTripId below for the Backend-authoritative
// trip record (id/title/version), which TWM-102 owns.
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
  plan: null,   // 'self-led' | 'twm-led'
  paid: false,
};

const DEFAULT_AUTH = { loggedIn: false, isGuest: false, name: '', email: '' };

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
  const [savedTrips, setSavedTrips] = useState(stored?.savedTrips ?? []);
  const [commandSnapshot, setCommandSnapshot] = useState(stored?.commandSnapshot ?? null);

  // Backend-authoritative trip record (id/title/version + guest session cookie).
  // Does not carry the mock trip content above — see TWM-102/TWM-110 split.
  const [tripRecord, setTripRecord] = useState(null);
  const [tripLoadStatus, setTripLoadStatus] = useState('idle'); // idle | loading | ready | error
  const [tripLoadError, setTripLoadError] = useState(null);
  const ensureTripPromise = useRef(null);

  async function loadOrCreateTrip() {
    setTripLoadStatus('loading');
    setTripLoadError(null);
    try {
      const records = await listTrips();
      const record = records[0] ?? await createTrip();
      setTripRecord(record);
      setTripLoadStatus('ready');
      return record;
    } catch (error) {
      setTripLoadStatus('error');
      setTripLoadError(error instanceof TripApiError ? error : new TripApiError('Trip persistence is unavailable.'));
      throw error;
    }
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
    if (!ensureTripPromise.current) {
      ensureTripPromise.current = loadOrCreateTrip().finally(() => {
        ensureTripPromise.current = null;
      });
    }
    return ensureTripPromise.current;
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, auth, savedTrips, commandSnapshot }));
    } catch {
      // Storage unavailable (private browsing, quota, etc.) — prototype state just won't survive a reload.
    }
  }, [trip, auth, savedTrips, commandSnapshot]);

  // My Trips is auto-derived from the current trip — no manual "save" step needed.
  useEffect(() => {
    if (!trip.destination) return;
    setSavedTrips(prev => {
      const idx = prev.findIndex(t => t.destination?.name === trip.destination.name);
      const entry = { ...trip, savedAt: new Date().toISOString() };
      if (idx !== -1 && JSON.stringify(prev[idx]) === JSON.stringify({ ...entry, savedAt: prev[idx].savedAt })) return prev;
      if (idx === -1) return [...prev, entry];
      const copy = [...prev];
      copy[idx] = entry;
      return copy;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  function updateTrip(patch) {
    setTrip(prev => ({ ...prev, ...patch }));
  }

  function applyMockCommandResponse(response) {
    const applied = applyCommandSnapshot(response);
    setTrip(previous => ({ ...previous, ...applied.tripPatch }));
    setCommandSnapshot(applied.commandSnapshot);
  }

  function startNewTrip() {
    setTrip(DEFAULT_TRIP);
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
      savedTrips, commandSnapshot, applyMockCommandResponse,
      currentTripId: tripRecord?.id ?? null, tripLoadStatus, tripLoadError, retryTripLoad, renameCurrentTrip,
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
