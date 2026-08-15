import { describe, it, expect } from 'vitest';
import {
  transportOptionsFor, feasibleTransportOptions, transportLegs, bundleRoundTrip,
  stayLegs, stayOptionsFor, activityBookings, notBookedYetLabel, modeLabel,
} from '../../../src/lib/bookingCatalog.js';

describe('transportLegs', () => {
  it('includes the origin<->destination bookend legs, not just local transfers', () => {
    const days = [
      { day_number: 1, primary_location: 'Gwalior' },
      { day_number: 2, primary_location: 'Gwalior' },
      { day_number: 3, primary_location: 'Orchha' },
    ];
    const legs = transportLegs(days, 'Delhi');
    expect(legs[0]).toEqual({ id: 'outbound-origin', from: 'Delhi', to: 'Gwalior' });
    expect(legs[legs.length - 1]).toEqual({ id: 'return-origin', from: 'Orchha', to: 'Delhi' });
    expect(legs).toHaveLength(3); // Delhi->Gwalior, Gwalior->Orchha, Orchha->Delhi
  });

  it('falls back to a generic origin label when none is known', () => {
    const legs = transportLegs([{ day_number: 1, primary_location: 'Goa' }], undefined);
    expect(legs[0].from).toBe('Home');
  });

  it('is empty for no days', () => {
    expect(transportLegs([], 'Delhi')).toEqual([]);
  });
});

describe('bundleRoundTrip', () => {
  it('bundles the outbound and return legs into one decision when they mirror each other', () => {
    const legs = [
      { id: 'outbound-origin', from: 'Delhi', to: 'Gwalior' },
      { id: 'leg-0', from: 'Gwalior', to: 'Orchha' },
      { id: 'return-origin', from: 'Orchha', to: 'Delhi' },
    ];
    const { bundle, rest } = bundleRoundTrip(legs);
    expect(bundle).toEqual({ id: 'round-trip', outbound: legs[0], inbound: legs[2] });
    expect(rest).toEqual([legs[1]]);
  });

  it('does not bundle when the trip is genuinely one-way', () => {
    const legs = [
      { id: 'a', from: 'Delhi', to: 'Gwalior' },
      { id: 'b', from: 'Gwalior', to: 'Mumbai' },
    ];
    const { bundle, rest } = bundleRoundTrip(legs);
    expect(bundle).toBeNull();
    expect(rest).toEqual(legs);
  });

  it('does not bundle a single leg', () => {
    const legs = [{ id: 'a', from: 'Delhi', to: 'Gwalior' }];
    expect(bundleRoundTrip(legs)).toEqual({ bundle: null, rest: legs });
  });
});

describe('feasibleTransportOptions', () => {
  const leg = { from: 'Delhi', to: 'Gwalior' };

  it('excludes a long-haul mode entirely (not faded) on a short trip', () => {
    const options = transportOptionsFor(leg);
    const { feasible, excluded } = feasibleTransportOptions(options, { tripDurationDays: 3 });
    expect(feasible.some(o => o.mode === 'bus')).toBe(false);
    expect(excluded.some(o => o.mode === 'bus')).toBe(true);
    expect(excluded.find(o => o.mode === 'bus').reason).toMatch(/isn't practical/);
  });

  it('allows the same long-haul mode on a longer trip', () => {
    const options = transportOptionsFor(leg);
    const { feasible, excluded } = feasibleTransportOptions(options, { tripDurationDays: 14 });
    expect(feasible.some(o => o.mode === 'bus')).toBe(true);
    expect(excluded.some(o => o.mode === 'bus')).toBe(false);
  });

  it('every option carries a real mode label, not a raw enum', () => {
    expect(modeLabel('flight')).toBe('Flight');
    expect(modeLabel('unknown')).toBe('unknown');
  });
});

describe('stayLegs / stayOptionsFor', () => {
  it('one stay per distinct consecutive location', () => {
    const days = [
      { day_number: 1, primary_location: 'Gwalior' },
      { day_number: 2, primary_location: 'Gwalior' },
      { day_number: 3, primary_location: 'Orchha' },
    ];
    const stays = stayLegs(days);
    expect(stays).toEqual([
      { id: 'stay-Gwalior', location: 'Gwalior', nights: 2 },
      { id: 'stay-Orchha', location: 'Orchha', nights: 1 },
    ]);
  });

  it('offers multiple tiered options per stay', () => {
    const options = stayOptionsFor({ id: 'stay-Gwalior', location: 'Gwalior', nights: 2 });
    expect(options.length).toBeGreaterThan(1);
    expect(options.every(o => o.name.includes('Gwalior'))).toBe(true);
  });
});

describe('activityBookings', () => {
  it('only includes ACTIVITY items genuinely flagged requires_advance_booking, never a mock', () => {
    const days = [
      {
        day_number: 1,
        timeline: [
          { kind: 'ACTIVITY', title: 'Safari', requires_advance_booking: true, detail: 'Book ahead.' },
          { kind: 'ACTIVITY', title: 'Free walk', requires_advance_booking: false, detail: 'Drop in.' },
          { kind: 'TRAVEL', title: 'Transfer', requires_advance_booking: true, detail: 'x' },
        ],
      },
    ];
    const activities = activityBookings(days);
    expect(activities).toEqual([{ id: 'activity-1-Safari', dayNumber: 1, title: 'Safari', detail: 'Book ahead.' }]);
  });

  it('is empty when nothing requires advance booking — never renders as an empty section', () => {
    const days = [{ day_number: 1, timeline: [{ kind: 'ACTIVITY', title: 'Walk', requires_advance_booking: false }] }];
    expect(activityBookings(days)).toEqual([]);
  });
});

describe('notBookedYetLabel', () => {
  it('names the specific segment, never a bare generic label', () => {
    expect(notBookedYetLabel('Delhi → Gwalior')).toBe('Delhi → Gwalior not booked yet');
    expect(notBookedYetLabel('Gwalior stay')).toBe('Gwalior stay not booked yet');
  });
});
