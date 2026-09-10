import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const sendTripCommand = vi.fn();
vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ sendTripCommand }),
}));
vi.mock('../../../src/lib/tripApi.js', () => ({ getTripFeasibility: vi.fn().mockResolvedValue({ modes: [] }) }));
vi.mock('../../../src/lib/booking/transportOptions.js', () => ({
  transportOptionsFor: vi.fn().mockResolvedValue([]),
  loadTransportBundle: vi.fn().mockResolvedValue({ options: [], feasibility: { modes: [] } }),
}));
import { loadTransportBundle } from '../../../src/lib/booking/transportOptions.js';
vi.mock('../../../src/lib/booking/stayOptions.js', () => ({ stayOptionsFor: vi.fn().mockResolvedValue([]) }));
import { stayOptionsFor } from '../../../src/lib/booking/stayOptions.js';
const trackEvent = vi.fn();
vi.mock('../../../src/lib/analytics.js', () => ({ trackEvent: (...a) => trackEvent(...a) }));

import { useBookingDrawers } from '../../../src/hooks/useBookingDrawers.js';

const STAY_TRIP_DATES = {
  id: 'trip:stay:1:2:goa', location: 'Goa', nights: 2, start_day_number: 1,
  checkin_date: '2026-09-26', checkout_date: '2026-09-28',
  date_precision: 'exact', date_source: 'trip_dates', month: null, board_item_ids: [],
};
const STAY_NO_DATE = { ...STAY_TRIP_DATES, id: 'trip:stay:1:2:none', checkin_date: null, checkout_date: null, date_precision: 'none', date_source: 'none' };

function setup(staySegments = [STAY_TRIP_DATES]) {
  return renderHook(() => useBookingDrawers({
    tripId: 'trip', view: { booking: { party: { adults: 3, children: 0, infants: 0 } } },
    days: [], staySegments,
  }));
}

beforeEach(() => {
  sendTripCommand.mockReset().mockResolvedValue({});
  loadTransportBundle.mockClear();
  stayOptionsFor.mockClear();
  trackEvent.mockReset();
});

describe('useBookingDrawers — TWM-228 date edit form', () => {
  it('exposes no precision-toggle state', () => {
    const { result } = setup();
    expect(result.current).not.toHaveProperty('prefEditMode');
    expect(result.current).not.toHaveProperty('setPrefEditMode');
  });

  it('seeds the edit form from an inherited trip-dates check-in', () => {
    const { result } = setup();
    act(() => result.current.openStayDrawer(STAY_TRIP_DATES.id));
    act(() => result.current.openPrefEditForm('stay', {
      id: STAY_TRIP_DATES.id, date_source: 'trip_dates', precision: 'exact', date: '2026-09-26', month: null,
    }));
    expect(result.current.prefEditOpen).toBe(true);
    expect(result.current.prefEditValue).toBe('2026-09-26');
  });

  it('auto-expands the picker for a segment with no known date', async () => {
    const { result } = setup([STAY_NO_DATE]);
    act(() => result.current.openStayDrawer(STAY_NO_DATE.id));
    await waitFor(() => expect(result.current.prefEditOpen).toBe(true));
    expect(result.current.prefEditTarget).toEqual({ type: 'stay', id: STAY_NO_DATE.id });
    expect(result.current.prefEditValue).toBe('');
  });

  it('submitPrefEdit always sends an exact date and drops the precision analytics prop', async () => {
    const { result } = setup();
    act(() => result.current.openStayDrawer(STAY_TRIP_DATES.id));
    act(() => result.current.openPrefEditForm('stay', {
      id: STAY_TRIP_DATES.id, date_source: 'trip_dates', precision: 'exact', date: '2026-09-26',
    }));
    act(() => result.current.setPrefEditValue('2026-10-05'));
    await act(async () => { await result.current.submitPrefEdit({ preventDefault() {} }); });

    expect(sendTripCommand).toHaveBeenCalledWith('set_search_pref', {
      searchPrefUpdate: { target_type: 'stay', target_id: STAY_TRIP_DATES.id, date: '2026-10-05' },
    });
    expect(trackEvent).toHaveBeenCalledWith('search_pref_updated', { target_type: 'stay' });
  });

  it('seeds check-out and sends checkout_date when the traveller moves it', async () => {
    const { result } = setup();
    act(() => result.current.openStayDrawer(STAY_TRIP_DATES.id));
    act(() => result.current.openPrefEditForm('stay', {
      id: STAY_TRIP_DATES.id, date_source: 'trip_dates', precision: 'exact',
      date: '2026-09-26', checkout: '2026-09-28',
    }));
    expect(result.current.prefEditCheckoutValue).toBe('2026-09-28');

    act(() => result.current.setPrefEditCheckoutValue('2026-09-30'));
    await act(async () => { await result.current.submitPrefEdit({ preventDefault() {} }); });
    expect(sendTripCommand).toHaveBeenCalledWith('set_search_pref', {
      searchPrefUpdate: {
        target_type: 'stay', target_id: STAY_TRIP_DATES.id,
        date: '2026-09-26', checkout_date: '2026-09-30',
      },
    });
  });

  it('does not send checkout_date for a transport leg', async () => {
    const { result } = setup();
    act(() => result.current.openStayDrawer(STAY_TRIP_DATES.id));
    act(() => result.current.openPrefEditForm('transport', {
      id: 't1', date_source: 'trip_dates', precision: 'exact', date: '2026-09-26',
    }));
    expect(result.current.prefEditCheckoutValue).toBe('');
    act(() => result.current.setPrefEditValue('2026-10-05'));
    await act(async () => { await result.current.submitPrefEdit({ preventDefault() {} }); });
    expect(sendTripCommand).toHaveBeenCalledWith('set_search_pref', {
      searchPrefUpdate: { target_type: 'transport', target_id: 't1', date: '2026-10-05' },
    });
  });

  it('exposes no hub state until a transport drawer with hubs is open', () => {
    const { result } = setup();
    expect(result.current.transportHubs).toEqual([]);
    expect(result.current.selectedHubCity).toBe(null);
  });

  it('submitTravelerEdit still sends the same set_party payload', async () => {
    const { result } = setup();
    act(() => result.current.openStayDrawer(STAY_TRIP_DATES.id));
    act(() => result.current.openTravelerEditForm());
    act(() => { result.current.setTravelerEditAdults(4); });
    await act(async () => { await result.current.submitTravelerEdit({ preventDefault() {} }); });
    expect(sendTripCommand).toHaveBeenCalledWith('set_party', {
      partyUpdate: { adults: 4, children: 0, infants: 0 },
    });
  });
});

describe('useBookingDrawers — option cache keyed by party composition', () => {
  it('re-resolves stay options when the party changes even at the same head count', async () => {
    stayOptionsFor.mockClear();
    const { result, rerender } = renderHook(
      ({ party }) => useBookingDrawers({ tripId: 'trip', view: { booking: { party } }, days: [], staySegments: [STAY_TRIP_DATES] }),
      { initialProps: { party: { adults: 3, children: 0, infants: 0 } } },
    );
    act(() => result.current.openStayDrawer(STAY_TRIP_DATES.id));
    await waitFor(() => expect(stayOptionsFor).toHaveBeenCalledTimes(1));
    expect(stayOptionsFor.mock.calls[0][2]).toEqual({ adults: 3, children: 0, infants: 0 });

    // 3 adults -> 2 adults + 1 child: head count still 3, redirect params differ.
    rerender({ party: { adults: 2, children: 1, infants: 0 } });
    await waitFor(() => expect(stayOptionsFor).toHaveBeenCalledTimes(2));
    expect(stayOptionsFor.mock.calls[1][2]).toEqual({ adults: 2, children: 1, infants: 0 });
  });
});

describe('useBookingDrawers — TWM-215 gateway hub picker', () => {
  const HUB_ITEM = {
    id: 'trip:1:0', kind: 'TRAVEL', from_city: 'Bengaluru', to_city: 'Sumerpur',
    is_gateway_leg: true, date_precision: 'none', resolved_date: null,
    hubs: [
      { city: 'Udaipur', side: 'destination', last_mile_km: 100, last_mile_duration_minutes: 150,
        long_haul_distance_km: 660 },
      { city: 'Rail Junction', side: 'destination', last_mile_km: 60, last_mile_duration_minutes: 90,
        long_haul_distance_km: 300 },
    ],
  };

  function hubSetup() {
    return renderHook(() => useBookingDrawers({
      tripId: 'trip', view: { booking: { party: { adults: 2, children: 0, infants: 0 } } },
      days: [{ day_number: 1, timeline: [HUB_ITEM] }], staySegments: [],
    }));
  }

  it('defaults the selected hub to the first candidate and fetches its leg', async () => {
    const { result } = hubSetup();
    act(() => result.current.openTransportDrawer(HUB_ITEM));

    expect(result.current.transportHubs.map(h => h.city)).toEqual(['Udaipur', 'Rail Junction']);
    expect(result.current.selectedHubCity).toBe('Udaipur');

    await waitFor(() => expect(loadTransportBundle).toHaveBeenCalled());
    const [, leg] = loadTransportBundle.mock.calls.at(-1);
    expect(leg).toMatchObject({ from: 'Bengaluru', to: 'Udaipur' });
  });

  it('switching hubs re-fetches for the new hub and passes its distance fallback', async () => {
    const { result } = hubSetup();
    act(() => result.current.openTransportDrawer(HUB_ITEM));
    await waitFor(() => expect(loadTransportBundle).toHaveBeenCalled());

    act(() => result.current.selectHub('Rail Junction'));
    expect(result.current.selectedHubCity).toBe('Rail Junction');

    await waitFor(() => {
      const [, leg, hub] = loadTransportBundle.mock.calls.at(-1);
      expect(leg).toMatchObject({ from: 'Bengaluru', to: 'Rail Junction' });
      expect(hub).toMatchObject({ city: 'Rail Junction', longHaulDistanceKm: 300 });
    });
  });
});

describe('useBookingDrawers — TWM-230 per-mode transport options', () => {
  const ITEM = {
    id: 'trip:1:0', kind: 'TRAVEL', from_city: 'Bengaluru', to_city: 'Sumerpur',
    is_gateway_leg: true, date_precision: 'none', resolved_date: null,
    transport_options: [
      {
        mode: 'flight',
        direct: false,
        hubs: [
          { city: 'Udaipur', side: 'destination', access_gap: 'air', last_mile_km: 100,
            last_mile_duration_minutes: 150, distance_km: 660, long_haul_distance_km: 660, feasible: true },
        ],
      },
      { mode: 'train', direct: true, hubs: [] },
    ],
  };

  function modeSetup() {
    return renderHook(() => useBookingDrawers({
      tripId: 'trip', view: { booking: { party: { adults: 2, children: 0, infants: 0 } } },
      days: [{ day_number: 1, timeline: [ITEM] }], staySegments: [],
    }));
  }

  it('does not fetch until a mode is selected, then targets that mode hub', async () => {
    const { result } = modeSetup();
    act(() => result.current.openTransportDrawer(ITEM));

    expect(result.current.transportModeOptions.map(option => option.mode)).toEqual(['flight', 'train']);
    expect(result.current.selectedTransportMode).toBe(null);
    expect(loadTransportBundle).not.toHaveBeenCalled();

    act(() => result.current.selectTransportMode('flight'));
    expect(trackEvent).toHaveBeenCalledWith('transport_mode_selected', { mode: 'flight' });
    await waitFor(() => expect(loadTransportBundle).toHaveBeenCalledTimes(1));
    const [, leg, hub,, modeResolution] = loadTransportBundle.mock.calls[0];
    expect(leg).toMatchObject({ from: 'Bengaluru', to: 'Udaipur' });
    expect(hub).toMatchObject({ city: 'Udaipur', accessGap: 'air' });
    expect(modeResolution).toMatchObject({ mode: 'flight', direct: false });
  });

  it('back navigation clears selected mode and hub', async () => {
    const { result } = modeSetup();
    act(() => result.current.openTransportDrawer(ITEM));
    act(() => result.current.selectTransportMode('flight'));
    await waitFor(() => expect(result.current.selectedHubCity).toBe('Udaipur'));

    act(() => result.current.clearSelectedTransportMode());
    expect(result.current.selectedTransportMode).toBe(null);
    expect(result.current.selectedHubCity).toBe(null);
    expect(trackEvent).toHaveBeenCalledWith('transport_back_to_chooser', {});
  });

  it('tracks mode hub selections', async () => {
    const { result } = modeSetup();
    act(() => result.current.openTransportDrawer(ITEM));
    act(() => result.current.selectTransportMode('flight'));
    await waitFor(() => expect(result.current.selectedHubCity).toBe('Udaipur'));

    act(() => result.current.selectHub('Udaipur'));
    expect(trackEvent).toHaveBeenCalledWith('transport_hub_selected', { city: 'Udaipur', mode: 'flight' });
  });
});
