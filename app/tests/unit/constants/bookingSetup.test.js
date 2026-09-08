import { describe, it, expect } from 'vitest';
import { searchPrefFor } from '../../../src/constants/bookingSetup.js';

// TWM-220: a per-entity search date is read straight off the enriched
// itinerary entity (its `date_source` / `precision` / `date` | `month`),
// not a `booking_setup` branch.
describe('searchPrefFor', () => {
  it('returns the exact date when the source is a search pref', () => {
    expect(searchPrefFor({ date_source: 'search_pref', precision: 'exact', date: '2026-06-10' }))
      .toEqual({ precision: 'exact', date: '2026-06-10' });
  });

  it('returns the month when the source is a month-precision search pref', () => {
    expect(searchPrefFor({ date_source: 'search_pref', precision: 'month', month: '2026-06' }))
      .toEqual({ precision: 'month', month: '2026-06' });
  });

  it('is null when the date came from the trip dates or nothing', () => {
    expect(searchPrefFor({ date_source: 'trip_dates', precision: 'exact', date: '2026-06-10' })).toBeNull();
    expect(searchPrefFor({ date_source: 'none', precision: 'none' })).toBeNull();
    expect(searchPrefFor(null)).toBeNull();
  });
});
