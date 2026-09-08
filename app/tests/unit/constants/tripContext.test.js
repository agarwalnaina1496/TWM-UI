import { describe, it, expect } from 'vitest';
import { TRIP_CONTEXT_KEYS } from '../../../src/constants/tripContext.js';

// TWM-220: only the canonical key names survive — the raw-value readers
// moved server-side into the TripView composer.
describe('TRIP_CONTEXT_KEYS', () => {
  it('exposes the canonical field names', () => {
    expect(TRIP_CONTEXT_KEYS).toEqual({
      ORIGIN_CITY: 'origin_city',
      NUM_TRAVELERS: 'num_travelers',
      TRIP_DURATION: 'trip_duration',
      TRAVEL_DATES: 'travel_dates',
      BUDGET: 'budget',
      DESTINATIONS: 'destinations',
    });
  });

  it('no longer exposes booking_dates or traveler_composition', () => {
    expect(TRIP_CONTEXT_KEYS.BOOKING_DATES).toBeUndefined();
    expect(TRIP_CONTEXT_KEYS.TRAVELER_COMPOSITION).toBeUndefined();
  });
});
