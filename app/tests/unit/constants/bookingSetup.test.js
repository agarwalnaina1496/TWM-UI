import { describe, it, expect } from 'vitest';
import {
  bookingSetupParty,
  bookingSetupSearchPref,
} from '../../../src/constants/bookingSetup.js';

describe('bookingSetupParty', () => {
  it('reads a structured party', () => {
    expect(bookingSetupParty({ booking_setup: { party: { adults: 2, children: 1, infants: 0 } } }))
      .toEqual({ adults: 2, children: 1, infants: 0 });
  });

  it('is null for a malformed party', () => {
    expect(bookingSetupParty({ booking_setup: { party: { adults: 0, children: 1, infants: 0 } } })).toBeNull();
    expect(bookingSetupParty({ booking_setup: { party: { adults: 2, children: '1', infants: 0 } } })).toBeNull();
    expect(bookingSetupParty({})).toBeNull();
  });
});

describe('bookingSetupSearchPref', () => {
  const tripState = {
    booking_setup: {
      search_prefs: {
        stays: { 't:stay:1:2:agra': { precision: 'exact', date: '2026-06-10' } },
        transports: { 't:2:0': { precision: 'month', month: '2026-06' } },
      },
    },
  };

  it('reads a stay segment override by id', () => {
    expect(bookingSetupSearchPref(tripState, 'stay', 't:stay:1:2:agra'))
      .toEqual({ precision: 'exact', date: '2026-06-10' });
  });

  it('reads a transport leg override by id', () => {
    expect(bookingSetupSearchPref(tripState, 'transport', 't:2:0'))
      .toEqual({ precision: 'month', month: '2026-06' });
  });

  it('is null for an unknown target or missing prefs', () => {
    expect(bookingSetupSearchPref(tripState, 'stay', 'nope')).toBeNull();
    expect(bookingSetupSearchPref({}, 'stay', 't:stay:1:2:agra')).toBeNull();
    expect(bookingSetupSearchPref(tripState, 'stay', null)).toBeNull();
  });
});
