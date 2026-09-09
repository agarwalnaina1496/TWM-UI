import { describe, it, expect } from 'vitest';
import { legFromItem, hubFromEntry, legForHub } from '../../../../src/lib/booking/legsFromItinerary.js';

const HUB_ENTRY = {
  city: 'Udaipur', side: 'destination', last_mile_km: 100,
  last_mile_duration_minutes: 150, long_haul_distance_km: 660, feasible_modes: ['flight', 'train', 'bus'],
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
      lastMileDurationMinutes: 150, longHaulDistanceKm: 660, feasibleModes: ['flight', 'train', 'bus'],
    }]);
  });

  it('is an empty hubs[] for a directly-connected leg', () => {
    expect(legFromItem({ from_city: 'Delhi', to_city: 'Jaipur', date_precision: 'none' }).hubs).toEqual([]);
  });
});

describe('hubFromEntry', () => {
  it('defaults missing numeric facts and modes', () => {
    expect(hubFromEntry({ city: 'X', side: 'origin' })).toEqual({
      city: 'X', side: 'origin', lastMileKm: null, lastMileDurationMinutes: null,
      longHaulDistanceKm: null, feasibleModes: [],
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
