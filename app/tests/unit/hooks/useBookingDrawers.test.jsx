import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const sendTripCommand = vi.fn();
vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ sendTripCommand }),
}));
vi.mock('../../../src/lib/tripApi.js', () => ({ getTripFeasibility: vi.fn().mockResolvedValue({ modes: [] }) }));
vi.mock('../../../src/lib/booking/transportOptions.js', () => ({ transportOptionsFor: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../src/lib/booking/stayOptions.js', () => ({ stayOptionsFor: vi.fn().mockResolvedValue([]) }));
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

beforeEach(() => { sendTripCommand.mockReset().mockResolvedValue({}); trackEvent.mockReset(); });

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
