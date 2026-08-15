import { describe, it, expect } from 'vitest';
import { parseTripMonthDate, isDiscoverOnly, selectHeroTrip } from '../../../src/lib/tripHero.js';

const NOW = new Date(2026, 2, 15); // March 15, 2026

function trip(id, tripContext, overrides = {}) {
  return { id, trip_state: { trip_context: tripContext, ...overrides } };
}

describe('parseTripMonthDate', () => {
  it('parses a recognizable month name from trip_context.month', () => {
    expect(parseTripMonthDate({ month: 'March' }, NOW)).toEqual(new Date(2026, 2, 1));
  });

  it('falls back to travel_window, then dates, when month is absent', () => {
    expect(parseTripMonthDate({ travel_window: 'early June' }, NOW)).toEqual(new Date(2026, 5, 1));
    expect(parseTripMonthDate({ dates: 'sometime in August' }, NOW)).toEqual(new Date(2026, 7, 1));
  });

  it('assumes next year when the named month has already passed', () => {
    expect(parseTripMonthDate({ month: 'January' }, NOW)).toEqual(new Date(2027, 0, 1));
  });

  it('returns null when nothing parses as a month', () => {
    expect(parseTripMonthDate({ month: 'flexible' }, NOW)).toBeNull();
    expect(parseTripMonthDate({}, NOW)).toBeNull();
    expect(parseTripMonthDate(undefined, NOW)).toBeNull();
  });
});

describe('isDiscoverOnly', () => {
  it('is true for a fresh chat that already has some context', () => {
    expect(isDiscoverOnly({ trip_context: { origin: 'Delhi' } })).toBe(true);
  });

  it('is true while still matching/recommending, before a destination is chosen', () => {
    expect(isDiscoverOnly({ stage: 'matching', trip_context: { origin: 'Delhi' } })).toBe(true);
    expect(isDiscoverOnly({ stage: 'recommendation_ready', trip_context: { origin: 'Delhi' } })).toBe(true);
    expect(isDiscoverOnly({ stage: 'recommended', trip_context: { origin: 'Delhi' } })).toBe(true);
  });

  it('is false from matched onward — the stage itself means a destination was picked', () => {
    expect(isDiscoverOnly({ stage: 'matched', trip_context: { origin: 'Delhi' } })).toBe(false);
    expect(isDiscoverOnly({ stage: 'planning', trip_context: { origin: 'Delhi' } })).toBe(false);
    expect(isDiscoverOnly({ stage: 'planned', trip_context: { origin: 'Delhi' } })).toBe(false);
    expect(isDiscoverOnly({ stage: 'booked', trip_context: { origin: 'Delhi' } })).toBe(false);
  });

  it('is false for a trip with no context at all', () => {
    expect(isDiscoverOnly({ trip_context: {} })).toBe(false);
    expect(isDiscoverOnly({})).toBe(false);
  });
});

describe('selectHeroTrip', () => {
  it('an ongoing (current-month) trip always wins over any upcoming trip', () => {
    const ongoing = trip('ongoing', { month: 'March' });
    const upcoming = trip('upcoming', { month: 'April' });
    expect(selectHeroTrip([upcoming, ongoing], NOW)).toBe(ongoing);
  });

  it('the nearest upcoming trip wins when nothing is ongoing', () => {
    const far = trip('far', { month: 'December' });
    const near = trip('near', { month: 'April' });
    expect(selectHeroTrip([far, near], NOW)).toBe(near);
  });

  it('returns null when no trip has a parseable month', () => {
    const vague = trip('vague', { month: 'flexible' });
    expect(selectHeroTrip([vague], NOW)).toBeNull();
  });

  it('returns null for an empty trip list', () => {
    expect(selectHeroTrip([], NOW)).toBeNull();
  });
});
