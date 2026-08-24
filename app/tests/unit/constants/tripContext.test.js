import { describe, it, expect } from 'vitest';
import { TRIP_CONTEXT_KEYS, tripOriginCity, tripTravelerCount } from '../../../src/constants/tripContext.js';

describe('tripOriginCity', () => {
  it('reads the canonical origin_city key', () => {
    expect(tripOriginCity({ origin_city: 'Bangalore' })).toBe('Bangalore');
  });

  it('never falls back to a noncanonical origin key', () => {
    expect(tripOriginCity({ origin: 'Bangalore' })).toBeNull();
  });

  it('is null for a missing/empty trip_context', () => {
    expect(tripOriginCity(undefined)).toBeNull();
    expect(tripOriginCity({})).toBeNull();
  });
});

describe('tripTravelerCount', () => {
  it('normalizes a string count to a number', () => {
    expect(tripTravelerCount({ num_travelers: '1' })).toBe(1);
  });

  it('passes through an already-numeric count', () => {
    expect(tripTravelerCount({ [TRIP_CONTEXT_KEYS.NUM_TRAVELERS]: 4 })).toBe(4);
  });

  it('is null for missing, empty, or non-numeric values', () => {
    expect(tripTravelerCount({})).toBeNull();
    expect(tripTravelerCount({ num_travelers: '' })).toBeNull();
    expect(tripTravelerCount({ num_travelers: 'a couple' })).toBeNull();
  });
});
