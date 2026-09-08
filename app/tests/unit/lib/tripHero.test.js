import { describe, it, expect } from 'vitest';
import { isDiscoverOnly, selectHeroTrip } from '../../../src/lib/tripHero.js';

const NOW = new Date(2026, 2, 15); // March 15, 2026

// TWM-220: a list item carries a server-composed `travel_window`
// ({ precision, departure?, month? } or null) instead of raw trip_context.
function listItem(id, travelWindow, { stage = 'matched', context = {} } = {}) {
  return {
    id,
    lifecycle: { stage },
    context_recap: Object.entries(context).map(([key, value]) => ({ key, label: key, value })),
    travel_window: travelWindow,
  };
}
const month = m => ({ precision: 'month', month: m });
const exact = d => ({ precision: 'exact', departure: d });

describe('isDiscoverOnly', () => {
  it('is true for a fresh chat that already has some context', () => {
    expect(isDiscoverOnly(listItem('a', null, { stage: 'new', context: { origin_city: 'Delhi' } }))).toBe(true);
  });

  it('is true while still matching/recommending', () => {
    expect(isDiscoverOnly(listItem('a', null, { stage: 'matching' }))).toBe(true);
    expect(isDiscoverOnly(listItem('a', null, { stage: 'recommended' }))).toBe(true);
  });

  it('is false from matched onward', () => {
    for (const stage of ['matched', 'planning', 'planned', 'booked']) {
      expect(isDiscoverOnly(listItem('a', null, { stage }))).toBe(false);
    }
  });

  it('is false for a trip with no context at all', () => {
    expect(isDiscoverOnly(listItem('a', null, { stage: 'new' }))).toBe(false);
    expect(isDiscoverOnly({})).toBe(false);
  });
});

describe('selectHeroTrip', () => {
  it('an ongoing (current-month) trip always wins over any upcoming trip', () => {
    const ongoing = listItem('ongoing', month('2026-03'));
    const upcoming = listItem('upcoming', month('2026-04'));
    expect(selectHeroTrip([upcoming, ongoing], NOW)).toBe(ongoing);
  });

  it('the nearest upcoming trip wins when nothing is ongoing', () => {
    const far = listItem('far', month('2026-12'));
    const near = listItem('near', exact('2026-04-10'));
    expect(selectHeroTrip([far, near], NOW)).toBe(near);
  });

  it('returns null when no trip has a travel window', () => {
    expect(selectHeroTrip([listItem('vague', null)], NOW)).toBeNull();
  });

  it('returns null for an empty trip list', () => {
    expect(selectHeroTrip([], NOW)).toBeNull();
  });
});
