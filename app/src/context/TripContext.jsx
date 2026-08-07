import { createContext, useContext, useEffect, useState } from 'react';

const TripContext = createContext(null);

// Fake-backend prototype only: persists to localStorage so a refresh doesn't
// wipe progress. Not a substitute for real trip persistence (see TWM-64/65/66).
const STORAGE_KEY = 'twm_prototype_state_v1';

const DEFAULT_TRIP = {
  destination: '',
  origin: '',
  budget: 'flexible',
  style: '',   // free-text trip goal, e.g. "slow, relaxing, good food"
  travelers: 2,
  month: 'flexible',
  tripLength: 3,   // number of days, either entered directly or derived from start/end dates
  places: [],   // [{ id, name, note }]
  days: [],     // [{ day, title, items: [{ id, text }] }]
  tripType: 'round',    // 'round' | 'one-way'
  departDate: '',       // ISO date string, e.g. '2026-11-14'
  returnDate: '',       // ISO date string, only used when tripType === 'round'
  travelMode: null,   // { id, mode, label, price, details } — selected travel option
  hotel: null,        // { id, name, price } — selected or uploaded
  bookingUploaded: false,
  plan: null,   // 'self-led' | 'twm-led'
  paid: false,
};

const DEFAULT_AUTH = { loggedIn: false, name: '', email: '' };

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, auth, savedTrips }));
    } catch {
      // Storage unavailable (private browsing, quota, etc.) — prototype state just won't survive a reload.
    }
  }, [trip, auth, savedTrips]);

  // My Trips is auto-derived from the current trip — no manual "save" step needed.
  useEffect(() => {
    if (!trip.destination) return;
    setSavedTrips(prev => {
      const idx = prev.findIndex(t => t.destination === trip.destination);
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

  function login({ name, email }) {
    setAuth({ loggedIn: true, name, email });
  }

  return (
    <TripContext.Provider value={{ trip, updateTrip, auth, login, savedTrips }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within a TripProvider');
  return ctx;
}
