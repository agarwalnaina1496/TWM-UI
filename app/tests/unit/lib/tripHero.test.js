import { describe, it, expect } from 'vitest';
import { isPastTrip, selectHeroTrip } from '../../../src/lib/tripHero.js';

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

describe('isPastTrip', () => {
  it('is true once the travel window has fully elapsed', () => {
    expect(isPastTrip(listItem('a', exact('2026-01-10')), NOW)).toBe(true);
  });

  it('is false for a trip still in its ongoing month, even past the exact day', () => {
    expect(isPastTrip(listItem('a', exact('2026-03-01')), NOW)).toBe(false);
    expect(isPastTrip(listItem('a', month('2026-03')), NOW)).toBe(false);
  });

  it('is false for an upcoming trip', () => {
    expect(isPastTrip(listItem('a', exact('2026-04-10')), NOW)).toBe(false);
  });

  it('is false for a trip with no travel window at all', () => {
    expect(isPastTrip(listItem('a', null), NOW)).toBe(false);
  });

  it('is true once stage reaches "done", regardless of travel_window', () => {
    expect(isPastTrip(listItem('a', null, { stage: 'done' }), NOW)).toBe(true);
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
