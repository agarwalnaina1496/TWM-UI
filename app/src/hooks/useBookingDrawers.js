import { useEffect, useState } from 'react';
import { useTrip } from '../context/TripContext.jsx';
import { loadTransportBundle } from '../lib/booking/transportOptions.js';
import { stayOptionsFor } from '../lib/booking/stayOptions.js';
import {
  legForHub, legFromItem, stayFromSegment,
  transportCacheKey as buildTransportCacheKey, transportHubState, travelerPartyLabel,
} from '../lib/booking/legsFromItinerary.js';
import { searchPrefFor } from '../constants/bookingSetup.js';
import { trackEvent } from '../lib/analytics.js';

// TWM-215: the single generic "keep the open drawer's cache filled" hook —
// regardless of how it got open (a fresh click, or a save elsewhere
// invalidating the cache while the drawer stayed open).
function useDrawerFetch(openKey, cache, loading, fetcher) {
  useEffect(() => {
    if (!openKey || cache[openKey] || loading) return;
    fetcher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, cache, loading]);
}

// Owns both booking drawers (transport + stay), their per-key option caches,
// and the two editors that live inside whichever drawer is open: the
// per-entity search-date preference (set_search_pref / clear_search_pref) and
// the trip-wide structured party (set_party). Every save invalidates the
// option caches so the open drawer re-resolves.
export function useBookingDrawers({ tripId, view, days, staySegments }) {
  const { sendTripCommand } = useTrip();

  const [prefEditOpen, setPrefEditOpen] = useState(false);
  const [prefEditValue, setPrefEditValue] = useState('');
  const [prefEditTarget, setPrefEditTarget] = useState(null); // { type, id }
  const [prefEditPending, setPrefEditPending] = useState(false);
  const [prefEditError, setPrefEditError] = useState(null);

  const [travelerEditOpen, setTravelerEditOpen] = useState(false);
  const [travelerEditAdults, setTravelerEditAdults] = useState(1);
  const [travelerEditChildren, setTravelerEditChildren] = useState(0);
  const [travelerEditInfants, setTravelerEditInfants] = useState(0);
  const [travelerEditPending, setTravelerEditPending] = useState(false);
  const [travelerEditError, setTravelerEditError] = useState(null);

  const [transportDrawerItem, setTransportDrawerItem] = useState(null); // an enriched gateway TRAVEL item
  const [transportDrawerLoading, setTransportDrawerLoading] = useState(false);
  const [transportDrawerError, setTransportDrawerError] = useState(null);
  const [selectedHubCity, setSelectedHubCity] = useState(null); // TWM-215: chosen gateway hub

  const [stayDrawerSegmentId, setStayDrawerSegmentId] = useState(null);
  const [stayDrawerLoading, setStayDrawerLoading] = useState(false);
  const [stayDrawerError, setStayDrawerError] = useState(null);

  const [transportData, setTransportData] = useState({});
  const [stayData, setStayData] = useState({});

  const party = view?.booking?.party ?? null;
  const partyTotal = party ? party.adults + party.children + party.infants : null;
  const partyLabel = party ? travelerPartyLabel(party) : null;
  const openGapPrompt = view?.open_gaps?.find(gap => gap.resolution === 'set_party')?.detail ?? null;

  const transportItem = transportDrawerItem
    ? (days.flatMap(d => d.timeline || []).find(i => i.id === transportDrawerItem.id) ?? transportDrawerItem)
    : null;
  const {
    leg: transportLeg, hubs: transportHubs, selected: selectedHub,
    selectedCity: resolvedHubCity, effectiveLeg,
  } = transportHubState(transportItem, selectedHubCity);
  const staySegment = stayDrawerSegmentId ? staySegments.find(s => s.id === stayDrawerSegmentId) ?? null : null;
  const stay = stayFromSegment(staySegment);

  const transportCacheKey = item => buildTransportCacheKey(item, selectedHub, partyTotal);
  function stayCacheKey(segment) {
    if (!segment) return null;
    return `${segment.id}::${segment.checkin_date ?? 'flex'}::${segment.nights}::${partyTotal ?? 'p?'}`;
  }

  async function fetchTransportOptions(item) {
    if (!item) return;
    const key = transportCacheKey(item);
    if (transportData[key]) return;
    setTransportDrawerError(null);
    setTransportDrawerLoading(true);
    try {
      const leg = legForHub(legFromItem(item), selectedHub);
      const bundle = await loadTransportBundle(tripId, leg, selectedHub, party);
      setTransportData(prev => ({ ...prev, [key]: bundle }));
    } catch (error) {
      setTransportDrawerError(error.message || 'Could not load transport options.');
    } finally {
      setTransportDrawerLoading(false);
    }
  }

  async function fetchStayOptions(segment) {
    if (!segment) return;
    const key = stayCacheKey(segment);
    if (!key || stayData[key]) return;
    setStayDrawerLoading(true);
    try {
      const options = await stayOptionsFor(tripId, stayFromSegment(segment), party);
      setStayData(prev => ({ ...prev, [key]: { options } }));
    } catch (error) {
      setStayDrawerError(error.message || 'Could not load stay options.');
    } finally {
      setStayDrawerLoading(false);
    }
  }

  useDrawerFetch(
    transportItem ? transportCacheKey(transportItem) : null,
    transportData,
    transportDrawerLoading,
    () => fetchTransportOptions(transportItem),
  );
  useDrawerFetch(
    stayCacheKey(staySegment),
    stayData,
    stayDrawerLoading,
    () => fetchStayOptions(staySegment),
  );

  function resetPrefEdit() {
    setPrefEditOpen(false);
    setPrefEditTarget(null);
    setPrefEditValue('');
    setPrefEditError(null);
  }

  function openTransportDrawer(item) {
    setTransportDrawerItem(item);
    setSelectedHubCity(null); // default to the first candidate hub, if any
    setTransportDrawerError(null);
    setTransportDrawerLoading(false);
    resetPrefEdit();
  }
  function closeTransportDrawer() {
    setTransportDrawerItem(null);
    setSelectedHubCity(null);
    resetPrefEdit();
  }
  function openStayDrawer(segmentId) {
    setStayDrawerSegmentId(segmentId);
    setStayDrawerError(null);
    setStayDrawerLoading(false);
    resetPrefEdit();
  }
  function closeStayDrawer() {
    setStayDrawerSegmentId(null);
    resetPrefEdit();
  }

  // TWM-228: a genuinely dateless entity (`date_precision === 'none'`) opens
  // with the date picker already expanded — a standard OTA form shows an empty
  // date field, it does not hide it behind a link. A known date stays
  // collapsed behind "· Change".
  const openDateEntity = staySegment
    ? { type: 'stay', id: staySegment.id, precision: staySegment.date_precision }
    : transportItem
      ? { type: 'transport', id: transportItem.id, precision: transportItem.date_precision }
      : null;
  useEffect(() => {
    if (!openDateEntity || openDateEntity.precision !== 'none') return;
    if (prefEditTarget?.id === openDateEntity.id) return;
    setPrefEditTarget({ type: openDateEntity.type, id: openDateEntity.id });
    setPrefEditValue('');
    setPrefEditError(null);
    setPrefEditOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDateEntity?.id, openDateEntity?.precision]);

  // TWM-228: the edit form is a single exact-date field — no precision choice.
  // It seeds from the entity's current effective date (an exact override or an
  // exact trip date); a month-precision or dateless entity starts empty so the
  // traveller picks a specific day.
  function openPrefEditForm(targetType, entity) {
    const effective = searchPrefFor(entity);
    setPrefEditTarget({ type: targetType, id: entity.id });
    setPrefEditValue(effective?.precision === 'exact' ? effective.date : '');
    setPrefEditError(null);
    setPrefEditOpen(true);
  }
  function closePrefEditForm() {
    setPrefEditOpen(false);
  }

  async function submitPrefEdit(event) {
    event.preventDefault();
    if (!prefEditTarget) return;
    setPrefEditPending(true);
    setPrefEditError(null);
    try {
      await sendTripCommand('set_search_pref', {
        searchPrefUpdate: {
          target_type: prefEditTarget.type,
          target_id: prefEditTarget.id,
          date: prefEditValue,
        },
      });
      trackEvent('search_pref_updated', { target_type: prefEditTarget.type });
      setTransportData({});
      setStayData({});
      setPrefEditOpen(false);
    } catch (error) {
      setPrefEditError(error.message || 'Could not save that date — your existing options are still available.');
    } finally {
      setPrefEditPending(false);
    }
  }

  async function clearPrefEdit() {
    if (!prefEditTarget) return;
    setPrefEditPending(true);
    setPrefEditError(null);
    try {
      await sendTripCommand('clear_search_pref', {
        searchPrefClear: { target_type: prefEditTarget.type, target_id: prefEditTarget.id },
      });
      trackEvent('search_pref_cleared', { target_type: prefEditTarget.type });
      setTransportData({});
      setStayData({});
      setPrefEditOpen(false);
    } catch (error) {
      setPrefEditError(error.message || 'Could not reset that date — your existing options are still available.');
    } finally {
      setPrefEditPending(false);
    }
  }

  function openTravelerEditForm() {
    setTravelerEditAdults(party?.adults ?? 1);
    setTravelerEditChildren(party?.children ?? 0);
    setTravelerEditInfants(party?.infants ?? 0);
    setTravelerEditError(null);
    setTravelerEditOpen(true);
  }
  function closeTravelerEditForm() {
    setTravelerEditOpen(false);
  }

  async function submitTravelerEdit(event) {
    event.preventDefault();
    setTravelerEditPending(true);
    setTravelerEditError(null);
    try {
      await sendTripCommand('set_party', {
        partyUpdate: {
          adults: travelerEditAdults,
          children: travelerEditChildren,
          infants: travelerEditInfants,
        },
      });
      trackEvent('party_updated', {
        adults: travelerEditAdults,
        children: travelerEditChildren,
        infants: travelerEditInfants,
      });
      setTransportData({});
      setStayData({});
      setTravelerEditOpen(false);
    } catch (error) {
      setTravelerEditError(error.message || 'Could not save the party — your existing options are still available.');
    } finally {
      setTravelerEditPending(false);
    }
  }

  return {
    days,
    party,
    partyLabel,
    openGapPrompt,

    transportDrawerItem,
    transportItem,
    transportLeg,
    transportHubs,
    selectedHubCity: resolvedHubCity,
    selectHub: setSelectedHubCity,
    effectiveLeg,
    transportOptions: transportItem ? transportData[transportCacheKey(transportItem)]?.options : undefined,
    transportFeasibility: transportItem ? transportData[transportCacheKey(transportItem)]?.feasibility : undefined,
    transportDrawerLoading,
    transportDrawerError,
    openTransportDrawer,
    closeTransportDrawer,

    stayDrawerSegmentId,
    staySegment,
    stay,
    stayOptions: stayData[stayCacheKey(staySegment)]?.options,
    stayDrawerLoading,
    stayDrawerError,
    openStayDrawer,
    closeStayDrawer,

    prefEditOpen,
    prefEditValue,
    setPrefEditValue,
    prefEditTarget,
    prefEditPending,
    prefEditError,
    openPrefEditForm,
    closePrefEditForm,
    submitPrefEdit,
    clearPrefEdit,

    travelerEditOpen,
    travelerEditAdults,
    setTravelerEditAdults,
    travelerEditChildren,
    setTravelerEditChildren,
    travelerEditInfants,
    setTravelerEditInfants,
    travelerEditPending,
    travelerEditError,
    openTravelerEditForm,
    closeTravelerEditForm,
    submitTravelerEdit,
  };
}
