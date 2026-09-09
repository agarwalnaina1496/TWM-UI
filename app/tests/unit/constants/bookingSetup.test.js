import { describe, it, expect } from 'vitest';
import { searchPrefFor, isSearchPrefOverride } from '../../../src/constants/bookingSetup.js';

// TWM-220/TWM-228: a per-entity search date is read straight off the enriched
// itinerary entity (its `date_source` / `precision` / `date` | `month`), not a
// `booking_setup` branch. `searchPrefFor` returns whatever the drawer would
// search with right now — override *or* inherited trip date — so the edit form
// can seed from it; `isSearchPrefOverride` says whether it is an explicit
// per-entity override (which alone gets a "reset to default" affordance).
describe('searchPrefFor', () => {
  it('returns the exact date whether it is an override or an inherited trip date', () => {
    expect(searchPrefFor({ date_source: 'search_pref', precision: 'exact', date: '2026-06-10' }))
      .toEqual({ precision: 'exact', date: '2026-06-10' });
    expect(searchPrefFor({ date_source: 'trip_dates', precision: 'exact', date: '2026-06-10' }))
      .toEqual({ precision: 'exact', date: '2026-06-10' });
  });

  it('returns the month for a month-precision date from either source', () => {
    expect(searchPrefFor({ date_source: 'search_pref', precision: 'month', month: '2026-06' }))
      .toEqual({ precision: 'month', month: '2026-06' });
    expect(searchPrefFor({ date_source: 'trip_dates', precision: 'month', month: '2026-10' }))
      .toEqual({ precision: 'month', month: '2026-10' });
  });

  it('is null when nothing resolves a date', () => {
    expect(searchPrefFor({ date_source: 'none', precision: 'none' })).toBeNull();
    expect(searchPrefFor({ date_source: 'trip_dates', precision: 'exact' })).toBeNull(); // no date value
    expect(searchPrefFor(null)).toBeNull();
  });
});

describe('isSearchPrefOverride', () => {
  it('is true only for an explicit per-entity search-pref override', () => {
    expect(isSearchPrefOverride({ date_source: 'search_pref', precision: 'exact', date: '2026-06-10' })).toBe(true);
    expect(isSearchPrefOverride({ date_source: 'trip_dates', precision: 'exact', date: '2026-06-10' })).toBe(false);
    expect(isSearchPrefOverride({ date_source: 'none', precision: 'none' })).toBe(false);
    expect(isSearchPrefOverride(null)).toBe(false);
  });
});
