import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { getItinerary } from '../lib/tripApi.js';
import { isTripEmpty } from '../lib/tripLifecycle.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import { useTripFromUrl } from './useTripFromUrl.js';

const BOOKING_PROMPT_SHOWN_KEY = uiStateKey(UI_STATE_SCREEN.DASHBOARD_OVERVIEW, 'bookingPromptShown');

// Owns the frozen-plan → itinerary lifecycle: the idempotent start_itinerary
// boot, the enriched Atlas-document fetch (re-run on every trip-version move),
// the empty-trip redirect, the one-time booking prompt, and dashboard
// analytics. Returns the derived itinerary shape the tabs render from.
export function useItineraryData() {
  const { commandSnapshot, sendTripCommand, tripLoadStatus, uiState, updateUiState } = useTrip();
  const navigate = useNavigate();
  const urlTripId = useTripFromUrl();

  const view = commandSnapshot;
  const tripId = view?.id;
  const frozenPlan = view?.plan?.frozen;
  const itineraryReady = view?.summary != null;

  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const [showBookingPrompt, setShowBookingPrompt] = useState(false);
  const bootStarted = useRef(false);

  const [itineraryStatus, setItineraryStatus] = useState('idle'); // idle | loading | ready | error
  const [itineraryDoc, setItineraryDoc] = useState(null);
  const [itineraryFetchError, setItineraryFetchError] = useState(null);
  const [itineraryTripId, setItineraryTripId] = useState(null);
  const itineraryFetchKey = useRef(null);

  // TWM-188: a direct/deep-link/stale-tab navigation to an empty trip has
  // nothing real to render — redirect home.
  useEffect(() => {
    if (!urlTripId || tripLoadStatus !== 'ready' || !isTripEmpty(view)) return;
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTripId, tripLoadStatus, view, navigate]);

  const trackedThinState = useRef(false);
  useEffect(() => {
    if (trackedThinState.current || tripLoadStatus !== 'ready' || frozenPlan) return;
    trackedThinState.current = true;
    trackEvent('dashboard_thin_state_viewed', { stage: view?.lifecycle?.stage ?? 'new' });
  }, [tripLoadStatus, frozenPlan, view?.lifecycle?.stage]);

  // Reopen never re-invokes Atlas: once an itinerary exists, render the
  // saved result. Otherwise, with a frozen plan, drive the (idempotent)
  // start_itinerary command once. TripContext re-fetches the TripView, so
  // `itineraryReady` flips true when it lands.
  useEffect(() => {
    if (tripLoadStatus !== 'ready' || !frozenPlan) return;
    if (itineraryReady) {
      setBootStatus('ready');
      return;
    }
    if (bootStarted.current) return;
    bootStarted.current = true;
    setBootStatus('booting');
    sendTripCommand('start_itinerary')
      .then(response => {
        if (response.trip?.summary != null) {
          trackEvent('itinerary_generated', { generation_type: 'atlas' });
          if (!uiState[BOOKING_PROMPT_SHOWN_KEY]) {
            setShowBookingPrompt(true);
            trackEvent('booking_prompt_shown', {});
            updateUiState({ [BOOKING_PROMPT_SHOWN_KEY]: true }).catch(() => {});
          }
        }
        setBootStatus('ready');
      })
      .catch(error => {
        trackFailure('itinerary_generation', error);
        setBootStatus('error');
        setBootError(error.message || 'Could not generate the detailed itinerary.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, frozenPlan, itineraryReady, sendTripCommand]);

  // Fetch the itinerary document once an itinerary exists — and re-fetch
  // whenever the trip version moves (a set_search_pref / set_party save
  // re-resolves per-item dates).
  useEffect(() => {
    if (!itineraryReady || !tripId) return;
    const key = `${tripId}:${view.version}`;
    if (itineraryFetchKey.current === key) return;
    itineraryFetchKey.current = key;
    setItineraryStatus('loading');
    getItinerary(tripId)
      .then(doc => {
        setItineraryDoc(doc);
        setItineraryTripId(tripId);
        setItineraryStatus('ready');
      })
      .catch(error => {
        setItineraryStatus('error');
        setItineraryFetchError(error.message || 'Could not load the detailed itinerary.');
      });
  }, [itineraryReady, tripId, view?.version]);

  const trackedDashboardEntry = useRef(false);
  useEffect(() => {
    if (trackedDashboardEntry.current || itineraryStatus !== 'ready') return;
    trackedDashboardEntry.current = true;
    trackEvent('itinerary_viewed', { view_source: 'dashboard' });
    trackEvent('dashboard_entered', { entry_source: 'itinerary' });
  }, [itineraryStatus]);

  const doc = itineraryStatus === 'ready' && itineraryTripId === tripId ? itineraryDoc?.result : null;
  const finalItinerary = doc?.final_itinerary ?? null;
  const days = finalItinerary?.days ?? [];
  const staySegments = doc?.stay_segments ?? [];
  const staySegmentByItemId = {};
  for (const segment of staySegments) {
    for (const itemId of segment.board_item_ids || []) staySegmentByItemId[itemId] = segment;
  }

  return {
    view,
    tripId,
    frozenPlan,
    itineraryReady,
    tripLoadStatus,
    bootStatus,
    bootError,
    itineraryStatus,
    itineraryFetchError,
    showBookingPrompt,
    setShowBookingPrompt,
    doc,
    days,
    staySegments,
    staySegmentByItemId,
  };
}
