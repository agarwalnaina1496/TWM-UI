import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTrip, listTrips, newIdempotencyKey, queueTripMutation,
  renameTrip as renameTripApi, saveUiState as saveUiStateApi, sendTripCommand as sendTripCommandApi,
  startTripFromFirstMessage, TripApiError,
} from '../lib/tripApi.js';
import {
  fetchCurrentUser, login as loginApi, logout as logoutApi, signup as signupApi,
} from '../lib/authApi.js';
import { TRIP_ID_PARAM } from '../lib/tripUrl.js';
import { tripKeys } from '../lib/tripKeys.js';
import { deriveTripLoadStatus } from '../lib/tripLoadStatus.js';

const TripContext = createContext(null);

// Guest-first (TWM-140): every visitor starts as an anonymous guest with a
// working session; login is an explicit upgrade, never a precondition.
const DEFAULT_AUTH = { loggedIn: false, isGuest: true, name: 'Guest', email: '' };
const EMPTY_UI_STATE = Object.freeze({});

function authFromUser(user) {
  return user ? { loggedIn: true, isGuest: false, name: user.email, email: user.email } : DEFAULT_AUTH;
}

// TWM-221: TripContext carries identity / auth / UI state and the current
// trip *id* only. Trip *data* — the composed TripView, the list, the round,
// the itinerary document — is read via React Query (`useCurrentTrip`,
// `useTripsQuery`, …). The old hand-rolled loader / cache / merge / re-GET
// is gone; commands and UI-state saves stay on this context as a thin
// passthrough that writes straight into the query cache.
export function TripProvider({ children }) {
  const location = useLocation();
  const bootUrlTripIdRef = useRef(new URLSearchParams(location.search).get(TRIP_ID_PARAM));
  const queryClient = useQueryClient();

  const [auth, setAuth] = useState(DEFAULT_AUTH);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [claimNotice, setClaimNotice] = useState(null);
  const [currentTripId, setCurrentTripId] = useState(null);
  const currentTripIdRef = useRef(null);
  useEffect(() => { currentTripIdRef.current = currentTripId; }, [currentTripId]);

  // The boot list — also the source the initial `currentTripId` is resolved
  // from: the URL's ?tripId= if it names a real trip, else the most recent
  // trip so a bare deep link (/trip-preview, /scout-chat) still resumes the
  // in-progress trip rather than rendering nothing.
  const tripsQuery = useQuery({ queryKey: tripKeys.list, queryFn: listTrips });
  const tripsData = tripsQuery.data;
  const bootResolved = useRef(false);
  useEffect(() => {
    if (bootResolved.current || !tripsData) return;
    bootResolved.current = true;
    if (currentTripIdRef.current) return;
    const urlId = bootUrlTripIdRef.current;
    const picked = (urlId && tripsData.find(t => t.id === urlId)?.id) || tripsData[0]?.id || null;
    if (picked) setCurrentTripId(picked);
  }, [tripsData]);

  // The composed TripView for the current trip. This one useQuery replaces
  // the hand-rolled loader + cache + merge + post-command re-GET.
  const tripQuery = useQuery({
    queryKey: tripKeys.trip(currentTripId),
    queryFn: () => getTrip(currentTripId),
    enabled: !!currentTripId,
  });
  const commandSnapshot = currentTripId ? tripQuery.data ?? null : null;
  const tripLoadStatus = deriveTripLoadStatus({ currentTripId, tripsQuery, tripQuery });
  const tripLoadError = (tripsQuery.error || (currentTripId ? tripQuery.error : null)) ?? null;

  const checkSession = useCallback(async () => {
    try {
      setAuth(authFromUser(await fetchCurrentUser()));
    } catch {
      setAuth(DEFAULT_AUTH);
    }
  }, []);
  useEffect(() => { checkSession(); }, [checkSession]);

  const retryTripLoad = useCallback(() => {
    bootResolved.current = false;
    return queryClient.invalidateQueries({ predicate: q => {
      const k = q.queryKey[0];
      return k === 'trips' || k === 'trip';
    } });
  }, [queryClient]);

  // Resolves the current trip id for a mutation, waiting on the boot list if
  // the pointer has not been set yet. TWM-189: a trip is never created bare
  // on demand — only startTrip() creates one.
  const ensureTripId = useCallback(async () => {
    if (currentTripIdRef.current) return currentTripIdRef.current;
    await queryClient.ensureQueryData({ queryKey: tripKeys.list, queryFn: listTrips });
    const id = queryClient.getQueryData(tripKeys.list)?.[0]?.id;
    if (!id) throw new Error('No trip exists yet — send a first message via startTrip() first.');
    return id;
  }, [queryClient]);

  const readTripView = useCallback(async (id, { fresh = false } = {}) => {
    if (!fresh) {
      const cached = queryClient.getQueryData(tripKeys.trip(id));
      if (cached) return cached;
    }
    return queryClient.fetchQuery({ queryKey: tripKeys.trip(id), queryFn: () => getTrip(id), staleTime: 0 });
  }, [queryClient]);

  const patchListItem = useCallback(view => {
    queryClient.setQueryData(tripKeys.list, prev => (
      prev
        ? (prev.some(t => t.id === view.id)
          ? prev.map(t => (t.id === view.id ? toListItem(view) : t))
          : [toListItem(view), ...prev])
        : prev
    ));
  }, [queryClient]);

  const dropUnavailableTrip = useCallback(id => {
    queryClient.setQueryData(tripKeys.list, prev => prev?.filter(t => t.id !== id) ?? prev);
    if (id === currentTripIdRef.current) setCurrentTripId(null);
  }, [queryClient]);

  // TWM-189: the only place a trip is created — runs the traveler's first
  // message, then fetches the composed TripView for the new row.
  const startTrip = useCallback(async ({ entryIntent, message, title } = {}) => {
    const response = await startTripFromFirstMessage({ entryIntent, message, title });
    const view = await queryClient.fetchQuery({ queryKey: tripKeys.trip(response.tripId), queryFn: () => getTrip(response.tripId) });
    queryClient.setQueryData(tripKeys.list, prev => [toListItem(view), ...(prev || []).filter(t => t.id !== view.id)]);
    setCurrentTripId(view.id);
    return { message: response.message, agent_meta: response.agent_meta, recommendation: response.recommendation, trip: view };
  }, [queryClient]);

  // Clears the "current trip" pointer so the next first message starts a
  // genuinely new Backend journey.
  const startNewTrip = useCallback(() => setCurrentTripId(null), []);

  // TWM-221: replaces the old getTrip / openTrip / viewTrip read trio. Warms
  // the ['trip', id] cache and points currentTripId at it before navigating
  // into a decision page; a gone trip (deleted / stale card) fails closed —
  // dropped from the list, `{ ok: false }` returned, never navigated into.
  const prefetchTrip = useCallback(async id => {
    try {
      const view = await queryClient.fetchQuery({ queryKey: tripKeys.trip(id), queryFn: () => getTrip(id) });
      patchListItem(view);
      setCurrentTripId(id);
      return { ok: true, record: view };
    } catch (error) {
      if (error instanceof TripApiError && error.status === 404) {
        dropUnavailableTrip(id);
        return { ok: false, reason: 'not_found' };
      }
      throw error;
    }
  }, [queryClient, patchListItem, dropUnavailableTrip]);

  const updateUiState = useCallback(async patch => {
    const id = await ensureTripId();
    return queueTripMutation(id, async () => {
      const current = await readTripView(id);
      const nextUiState = { ...(current.ui_state || {}), ...patch };
      try {
        const saved = await saveUiStateApi(id, nextUiState, current.version);
        queryClient.setQueryData(tripKeys.trip(id), saved);
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) await readTripView(id, { fresh: true });
        throw error;
      }
    });
  }, [ensureTripId, readTripView, queryClient]);

  const renameCurrentTrip = useCallback(async title => {
    const id = await ensureTripId();
    return queueTripMutation(id, async () => {
      const current = await readTripView(id);
      try {
        const saved = await renameTripApi(id, title, current.version);
        queryClient.setQueryData(tripKeys.trip(id), saved);
        patchListItem(saved);
        return saved;
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) await readTripView(id, { fresh: true });
        throw error;
      }
    });
  }, [ensureTripId, readTripView, patchListItem, queryClient]);

  const renameTrip = useCallback(async (id, title) => {
    const target = (queryClient.getQueryData(tripKeys.list) || []).find(t => t.id === id);
    if (!target) return { ok: false, reason: 'not_found' };
    return queueTripMutation(id, async () => {
      try {
        const saved = await renameTripApi(id, title, target.version);
        patchListItem(saved);
        if (id === currentTripIdRef.current) queryClient.setQueryData(tripKeys.trip(id), saved);
        return { ok: true, record: saved };
      } catch (error) {
        if (error instanceof TripApiError && error.status === 404) {
          dropUnavailableTrip(id);
          return { ok: false, reason: 'not_found' };
        }
        if (error instanceof TripApiError && error.status === 409) {
          patchListItem(await readTripView(id, { fresh: true }));
        }
        throw error;
      }
    });
  }, [queryClient, patchListItem, dropUnavailableTrip, readTripView]);

  // The single browser mutation boundary: POST /api/trips/{id}/commands.
  // TWM-220/TWM-221: the command response is branch-shaped; we force-refetch
  // the composed TripView into cache (the idiomatic post-mutation
  // invalidation), fold the produced round into ['recommendations', id], and
  // let ['itinerary', id] revalidate. The response's own message /
  // agent_meta / recommendation are returned alongside the fresh view.
  const sendTripCommand = useCallback(async (command, { message, optionId, destination, tripContext, refinement, partyUpdate, searchPrefUpdate, searchPrefClear, idempotencyKey } = {}) => {
    const id = await ensureTripId();
    return queueTripMutation(id, async () => {
      const current = await readTripView(id);
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
        const response = await sendTripCommandApi(id, payload);
        const view = await readTripView(id, { fresh: true });
        patchListItem(view);
        if (response.recommendation) queryClient.setQueryData(tripKeys.recommendations(id), response.recommendation);
        queryClient.invalidateQueries({ queryKey: tripKeys.itinerary(id) });
        return { message: response.message, agent_meta: response.agent_meta, recommendation: response.recommendation, trip: view };
      } catch (error) {
        if (error instanceof TripApiError && error.status === 409) await readTripView(id, { fresh: true });
        throw error;
      }
    });
  }, [ensureTripId, readTripView, patchListItem, queryClient]);

  const openLoginModal = useCallback(() => setLoginModalOpen(true), []);
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), []);
  const dismissClaimNotice = useCallback(() => setClaimNotice(null), []);
  const setAuthDirect = useCallback(next => setAuth(next), []);
  const setContact = useCallback(({ name, email }) => setAuth(prev => ({ ...prev, name, email })), []);
  const continueWithoutLogin = useCallback(() => setAuth(DEFAULT_AUTH), []);

  const resetTripDataForAuthChange = useCallback(() => {
    bootResolved.current = false;
    setCurrentTripId(null);
    return queryClient.invalidateQueries();
  }, [queryClient]);

  const signup = useCallback(async (email, password) => {
    const signupResult = await signupApi(email, password);
    if (signupResult.claimed_trip_count > 0) setClaimNotice({ count: signupResult.claimed_trip_count });
    return signupResult;
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await loginApi(email, password);
    setAuth(authFromUser(result));
    if (result.claimed_trip_count > 0) setClaimNotice({ count: result.claimed_trip_count });
    await resetTripDataForAuthChange();
    return result;
  }, [resetTripDataForAuthChange]);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setAuth(DEFAULT_AUTH);
      await resetTripDataForAuthChange();
    }
  }, [resetTripDataForAuthChange]);

  const hasAccess = auth.loggedIn || auth.isGuest;

  const uiState = commandSnapshot?.ui_state ?? EMPTY_UI_STATE;

  const value = useMemo(() => ({
    auth, hasAccess, setAuthDirect, setContact,
    signup, login, continueWithoutLogin, logout,
    loginModalOpen, openLoginModal, closeLoginModal,
    claimNotice, dismissClaimNotice,
    currentTripId, setCurrentTripId, startTrip, startNewTrip, prefetchTrip,
    commandSnapshot, tripLoadStatus, tripLoadError, uiState,
    sendTripCommand, updateUiState, renameCurrentTrip, renameTrip, retryTripLoad,
  }), [
    auth, hasAccess, setAuthDirect, setContact, signup, login, continueWithoutLogin, logout,
    loginModalOpen, openLoginModal, closeLoginModal, claimNotice, dismissClaimNotice,
    currentTripId, startTrip, startNewTrip, prefetchTrip,
    commandSnapshot, tripLoadStatus, tripLoadError, uiState,
    sendTripCommand, updateUiState, renameCurrentTrip, renameTrip, retryTripLoad,
  ]);

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

// A composed TripView carries everything a TripListItem does plus more —
// project it down so the ['trips'] cache stays list-shaped after a full
// fetch / rename / command.
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
