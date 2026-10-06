import { describe, it, expect } from 'vitest';
import { heroLabel, isPastTrip, selectHeroTrip } from '../../../src/lib/tripHero.js';

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
  it('picks the trip underway, not an upcoming one', () => {
    const underway = listItem('underway', exact('2026-03-14'), { context: { trip_duration: '4' } });
    const upcoming = listItem('upcoming', month('2026-04'));
    expect(selectHeroTrip([upcoming, underway], NOW)).toBe(underway);
    expect(heroLabel(underway, NOW)).toBe('Happening now');
  });

  it('a trip whose departure is later this month is not underway yet', () => {
    expect(selectHeroTrip([listItem('later', exact('2026-03-20'))], NOW)).toBeNull();
  });

  it('a trip whose length has run out is no longer underway', () => {
    expect(selectHeroTrip([listItem('over', exact('2026-03-10'), { context: { trip_duration: '3' } })], NOW)).toBeNull();
  });

  it('with only a month known, the slot is "This month", and underway still wins over it', () => {
    const monthOnly = listItem('month', month('2026-03'));
    const underway = listItem('underway', exact('2026-03-15'));
    expect(selectHeroTrip([monthOnly], NOW)).toBe(monthOnly);
    expect(heroLabel(monthOnly, NOW)).toBe('This month');
    expect(selectHeroTrip([monthOnly, underway], NOW)).toBe(underway);
  });

  it('returns null when nothing is ongoing, even if trips are upcoming', () => {
    const far = listItem('far', month('2026-12'));
    const near = listItem('near', exact('2026-04-10'));
    expect(selectHeroTrip([far, near], NOW)).toBeNull();
  });

  it('returns null when no trip has a travel window', () => {
    expect(selectHeroTrip([listItem('vague', null)], NOW)).toBeNull();
  });

  it('returns null for an empty trip list', () => {
    expect(selectHeroTrip([], NOW)).toBeNull();
  });
});
