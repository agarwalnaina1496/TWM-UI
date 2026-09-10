import { useEffect, useState } from 'react';
import { useTrip } from '../context/TripContext.jsx';
import { loadTransportBundle } from '../lib/booking/transportOptions.js';
import { stayOptionsFor } from '../lib/booking/stayOptions.js';
import {
  stayFromSegment, transportCacheKey as buildTransportCacheKey,
  transportHubState, travelerPartyLabel,
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
  const [prefEditCheckoutValue, setPrefEditCheckoutValue] = useState(''); // stay check-out only
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
  // Cache key: the full a/c/i composition, not the head-count total — an
  // adults↔children swap keeps the total but changes every provider redirect.
  const partyKey = party ? `${party.adults}-${party.children}-${party.infants}` : null;
  const partyLabel = party ? travelerPartyLabel(party) : null;
  const openGapPrompt = view?.open_gaps?.find(gap => gap.resolution === 'set_party')?.detail ?? null;

  const transportItem = transportDrawerItem
    ? (days.flatMap(d => d.timeline || []).find(i => i.id === transportDrawerItem.id) ?? transportDrawerItem)
    : null;
  const {
    leg: transportLeg, pickerHubs: transportHubs, autoOriginHub, selected: selectedHub,
    selectedCity: resolvedHubCity, effectiveLeg,
  } = transportHubState(transportItem, selectedHubCity);
  const staySegment = stayDrawerSegmentId ? staySegments.find(s => s.id === stayDrawerSegmentId) ?? null : null;
  const stay = stayFromSegment(staySegment);

  const transportCacheKey = item => buildTransportCacheKey(item, autoOriginHub, selectedHub, partyKey);
  // Drop every cached option bundle so the open drawer re-resolves its links.
  const invalidateOptions = () => { setTransportData({}); setStayData({}); };

  function stayCacheKey(segment) {
    if (!segment) return null;
    return `${segment.id}::${segment.checkin_date ?? 'flex'}::${segment.checkout_date ?? 'flex'}::${segment.nights}::${partyKey ?? 'p?'}`;
  }

  async function fetchTransportOptions(item) {
    if (!item) return;
    const key = transportCacheKey(item);
    if (transportData[key]) return;
    setTransportDrawerError(null);
    setTransportDrawerLoading(true);
    try {
      const bundle = await loadTransportBundle(tripId, effectiveLeg, selectedHub, party);
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
    setPrefEditCheckoutValue('');
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

  // TWM-228: a dateless entity opens with the picker already expanded (a
  // standard OTA form shows an empty date field, not a link). Known dates stay
  // collapsed behind "Change".
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
    setPrefEditCheckoutValue('');
    setPrefEditError(null);
    setPrefEditOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDateEntity?.id, openDateEntity?.precision]);

  // TWM-228/TWM-216: the edit form seeds from the entity's current effective
  // dates — an exact date (override or trip date), plus the stay's check-out
  // (override or check-in + itinerary nights). Month/dateless starts empty.
  function openPrefEditForm(targetType, entity) {
    const effective = searchPrefFor(entity);
    setPrefEditTarget({ type: targetType, id: entity.id });
    setPrefEditValue(effective?.precision === 'exact' ? effective.date : '');
    setPrefEditCheckoutValue(targetType === 'stay' ? (entity.checkout ?? '') : '');
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
          ...(prefEditTarget.type === 'stay' && prefEditCheckoutValue ? { checkout_date: prefEditCheckoutValue } : {}),
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
      const partyUpdate = { adults: travelerEditAdults, children: travelerEditChildren, infants: travelerEditInfants };
      await sendTripCommand('set_party', { partyUpdate });
      trackEvent('party_updated', partyUpdate);
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
    selectedHub,
    autoOriginHub,
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
    prefEditCheckoutValue,
    setPrefEditCheckoutValue,
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
