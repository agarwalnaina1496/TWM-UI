import { describe, it, expect } from 'vitest';
import {
  legFromItem, hubFromEntry, legForHub, transportHubState, selectedTransportOption,
} from '../../../../src/lib/booking/legsFromItinerary.js';

const HUB_ENTRY = {
  city: 'Udaipur', side: 'destination', last_mile_km: 100,
  last_mile_duration_minutes: 150, long_haul_distance_km: 660,
};

describe('legFromItem', () => {
  it('carries the resolved date by precision and a normalized hubs[] set', () => {
    const leg = legFromItem({
      from_city: 'Bengaluru', to_city: 'Sumerpur',
      date_precision: 'exact', resolved_date: '2026-05-01',
      hubs: [HUB_ENTRY],
    });
    expect(leg).toMatchObject({ from: 'Bengaluru', to: 'Sumerpur', departureDate: '2026-05-01', departureMonth: null });
    expect(leg.hubs).toEqual([{
      city: 'Udaipur', side: 'destination', lastMileKm: 100,
      lastMileDurationMinutes: 150, longHaulDistanceKm: 660, distanceKm: 660,
      accessGap: null, feasible: true,
    }]);
  });

  it('is an empty hubs[] for a directly-connected leg', () => {
    expect(legFromItem({ from_city: 'Delhi', to_city: 'Jaipur', date_precision: 'none' }).hubs).toEqual([]);
  });

  it('normalizes transport_options for per-mode drawer selection', () => {
    const leg = legFromItem({
      from_city: 'Bengaluru', to_city: 'Sumerpur', date_precision: 'none',
      transport_options: [
        { mode: 'flight', direct: false, hubs: [{ ...HUB_ENTRY, access_gap: 'air', feasible: true }] },
        { mode: 'train', direct: true, feasible: false, ruled_out_reason: 'No railhead.', long_journey_note: null, hubs: [] },
      ],
    });
    expect(leg.transportOptions[0].hubs[0]).toMatchObject({ city: 'Udaipur', accessGap: 'air', feasible: true });
    expect(leg.transportOptions[1]).toEqual({
      mode: 'train',
      direct: true,
      feasible: false,
      ruledOutReason: 'No railhead.',
      longJourneyNote: null,
      hubs: [],
    });
  });
});

describe('selectedTransportOption', () => {
  it('returns the selected mode resolution from an enriched item', () => {
    const item = {
      from_city: 'Bengaluru', to_city: 'Sumerpur', date_precision: 'none',
      transport_options: [{ mode: 'train', direct: true, hubs: [] }],
    };
    expect(selectedTransportOption(item, 'train')).toEqual({
      mode: 'train',
      direct: true,
      feasible: true,
      ruledOutReason: null,
      longJourneyNote: null,
      hubs: [],
    });
    expect(selectedTransportOption(item, 'flight')).toBe(null);
  });
});

describe('hubFromEntry', () => {
  it('defaults missing numeric facts and modes', () => {
    expect(hubFromEntry({ city: 'X', side: 'origin' })).toEqual({
      city: 'X', side: 'origin', lastMileKm: null, lastMileDurationMinutes: null,
      longHaulDistanceKm: null, distanceKm: null, accessGap: null, feasible: true,
    });
  });
});

describe('legForHub', () => {
  const leg = { from: 'Bengaluru', to: 'Sumerpur' };

  it('replaces the destination for a destination-side hub', () => {
    expect(legForHub(leg, { city: 'Udaipur', side: 'destination' })).toEqual({ from: 'Bengaluru', to: 'Udaipur' });
  });

  it('replaces the origin for an origin-side hub', () => {
    expect(legForHub({ from: 'Sumerpur', to: 'Mumbai' }, { city: 'Udaipur', side: 'origin' }))
      .toEqual({ from: 'Udaipur', to: 'Mumbai' });
  });

  it('returns the leg unchanged when there is no hub', () => {
    expect(legForHub(leg, null)).toBe(leg);
  });
});

describe('transportHubState', () => {
  function item(hubs) {
    return { from_city: 'Bengaluru', to_city: 'Sumerpur', date_precision: 'none', hubs };
  }

  it('one hubless endpoint: the whole hub set is the picker, no auto origin', () => {
    const state = transportHubState(item([
      { city: 'Udaipur', side: 'destination', last_mile_km: 100 },
      { city: 'Ahmedabad', side: 'destination', last_mile_km: 220 },
    ]), null);
    expect(state.pickerHubs.map(h => h.city)).toEqual(['Udaipur', 'Ahmedabad']);
    expect(state.autoOriginHub).toBe(null);
    expect(state.selected.city).toBe('Udaipur');
    expect(state.effectiveLeg).toMatchObject({ from: 'Bengaluru', to: 'Udaipur' });
  });

  it('both endpoints hubless: picker is the destination side, origin auto-picks its first candidate', () => {
    const state = transportHubState(item([
      { city: 'Jodhpur', side: 'origin', last_mile_km: 40 },
      { city: 'Udaipur', side: 'destination', last_mile_km: 100 },
      { city: 'Ahmedabad', side: 'destination', last_mile_km: 220 },
    ]), 'Ahmedabad');
    expect(state.pickerHubs.map(h => h.city)).toEqual(['Udaipur', 'Ahmedabad']);
    expect(state.autoOriginHub.city).toBe('Jodhpur');
    expect(state.selected.city).toBe('Ahmedabad');
    // both endpoints substituted
    expect(state.effectiveLeg).toMatchObject({ from: 'Jodhpur', to: 'Ahmedabad', departureDate: null, departureMonth: null, hubs: expect.any(Array) });
  });

  it('directly connected leg: no hubs, no substitution', () => {
    const state = transportHubState({ from_city: 'Delhi', to_city: 'Jaipur', date_precision: 'none' }, null);
    expect(state.pickerHubs).toEqual([]);
    expect(state.selected).toBe(null);
    expect(state.effectiveLeg).toMatchObject({ from: 'Delhi', to: 'Jaipur' });
  });
});
