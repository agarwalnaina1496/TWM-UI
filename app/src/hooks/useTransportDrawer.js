import { useState } from 'react';
import { loadTransportBundle } from '../lib/booking/transportOptions.js';
import {
  transportCacheKey as buildTransportCacheKey,
  transportHubState,
  legForHub,
  resolveSelectedHub,
  selectedTransportOption,
  transportModeCacheKey,
} from '../lib/booking/legsFromItinerary.js';
import { useDrawerFetch } from './useDrawerFetch.js';

export function useTransportDrawer({ tripId, days, party, partyKey, onOpened, onClosed }) {
  const [drawerItem, setDrawerItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedHubCity, setSelectedHubCity] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [data, setData] = useState({});

  const item = drawerItem
    ? (days.flatMap(day => day.timeline || []).find(candidate => candidate.id === drawerItem.id) ?? drawerItem)
    : null;
  const legacy = transportHubState(item, selectedHubCity);
  const modeOption = selectedTransportOption(item, selectedMode);
  const modeHubs = (modeOption?.hubs || []).filter(hub => hub.feasible !== false);
  const selectedModeHub = modeOption && !modeOption.direct
    ? resolveSelectedHub(modeHubs, selectedHubCity)
    : null;
  const effectiveLeg = modeOption
    ? legForHub(legacy.leg, selectedModeHub)
    : legacy.effectiveLeg;

  const cacheKey = subject => (
    modeOption
      ? transportModeCacheKey(subject, selectedMode, selectedModeHub, partyKey)
      : buildTransportCacheKey(subject, legacy.autoOriginHub, legacy.selected, partyKey)
  );

  async function fetchOptions(subject) {
    if (!subject || !effectiveLeg) return;
    if ((subject.transport_options || []).length && !modeOption) return;
    const key = cacheKey(subject);
    if (data[key]) return;
    setError(null);
    setLoading(true);
    try {
      const bundle = await loadTransportBundle(
        tripId,
        effectiveLeg,
        selectedModeHub || legacy.selected,
        party,
        modeOption,
      );
      setData(prev => ({ ...prev, [key]: bundle }));
    } catch (fetchError) {
      setError(fetchError.message || 'Could not load transport options.');
    } finally {
      setLoading(false);
    }
  }

  useDrawerFetch(item ? cacheKey(item) : null, data, loading, () => fetchOptions(item));

  function open(nextItem) {
    setDrawerItem(nextItem);
    setSelectedHubCity(null);
    setSelectedMode(null);
    setError(null);
    setLoading(false);
    onOpened?.();
  }

  function close() {
    setDrawerItem(null);
    setSelectedHubCity(null);
    setSelectedMode(null);
    onClosed?.();
  }

  return {
    drawerItem,
    item,
    leg: legacy.leg,
    hubs: legacy.pickerHubs,
    modeOptions: legacy.leg?.transportOptions || [],
    selectedMode,
    selectMode: mode => { setSelectedMode(mode); setSelectedHubCity(null); },
    clearSelectedMode: () => { setSelectedMode(null); setSelectedHubCity(null); },
    modeHubs,
    selectedHub: selectedModeHub || legacy.selected,
    autoOriginHub: legacy.autoOriginHub,
    selectedHubCity: (selectedModeHub || legacy.selected)?.city ?? legacy.selectedCity,
    selectHub: setSelectedHubCity,
    effectiveLeg,
    options: item ? data[cacheKey(item)]?.options : undefined,
    feasibility: item ? data[cacheKey(item)]?.feasibility : undefined,
    loading,
    error,
    open,
    close,
    clearData: () => setData({}),
  };
}
