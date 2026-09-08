import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isTripEmpty, isItineraryReady, isCompletedTrip, stageBadge, stageCta, tripStatusLine, relativeUpdatedAt,
  contextRecapPills, contextDestination,
} from '../../../src/lib/tripLifecycle.js';

// TWM-220: every helper reads a `TripView` (full) or a `TripListItem` (thin).
// Both carry `lifecycle` + `context_recap`; thin list items add
// has_places / has_day_plan / has_itinerary / awaiting / has_recommendation.
function recap(entries) {
  return Object.entries(entries).map(([key, value]) => ({ key, label: key, value }));
}
function trip(overrides = {}) {
  const { stage = 'new', context = {}, ...rest } = overrides;
  return { lifecycle: { stage }, context_recap: recap(context), ...rest };
}

describe('tripLifecycle stage helpers', () => {
  it.each([
    ['new', {}, true],
    ['new with context', { context: { origin_city: 'Delhi' } }, false],
    ['matching', { stage: 'matching' }, false],
    ['planned', { stage: 'planned' }, false],
  ])('isTripEmpty: %s', (_label, overrides, expected) => {
    expect(isTripEmpty(trip(overrides))).toBe(expected);
  });

  it.each([
    ['has_itinerary flag (list item)', { has_itinerary: true }, true],
    ['summary present (full view)', { summary: { title: 'x' } }, true],
    ['neither', {}, false],
  ])('isItineraryReady: %s', (_label, overrides, expected) => {
    expect(isItineraryReady(trip(overrides))).toBe(expected);
  });

  it('isCompletedTrip is true only for stage done', () => {
    expect(isCompletedTrip(trip({ stage: 'done' }))).toBe(true);
    expect(isCompletedTrip(trip({ stage: 'planned' }))).toBe(false);
  });

  it.each([
    ['new, no context', {}, 'New'],
    ['new, has context', { context: { origin_city: 'Delhi' } }, 'In conversation'],
    ['matching', { stage: 'matching' }, 'In conversation'],
    ['recommended', { stage: 'recommended' }, 'Recommendations ready'],
    ['matched', { stage: 'matched' }, 'Destination chosen'],
    ['planning', { stage: 'planning' }, 'Planning in progress'],
    ['plan_ready', { stage: 'plan_ready' }, 'Plan drafted'],
    ['planned', { stage: 'planned' }, 'Plan ready'],
    ['booked', { stage: 'booked' }, 'Booked'],
    ['done', { stage: 'done' }, 'Completed'],
    ['itinerary ready overrides stage', { stage: 'planning', has_itinerary: true }, 'Itinerary ready'],
  ])('stageBadge: %s -> %s', (_label, overrides, expectedText) => {
    expect(stageBadge(trip(overrides)).text).toBe(expectedText);
  });

  it.each([
    ['new, no context', {}, '/'],
    ['new, has context', { context: { origin_city: 'Delhi' } }, '/scout-chat'],
    ['matching, no recommendation yet', { stage: 'matching' }, '/scout-chat'],
    ['recommended', { stage: 'recommended' }, '/destinations'],
    ['matched', { stage: 'matched' }, '/destinations'],
    ['planning, no day_plan yet', { stage: 'planning' }, '/scout-chat'],
    ['plan_ready', { stage: 'plan_ready', has_day_plan: true }, '/trip-preview'],
    ['planned', { stage: 'planned' }, '/dashboard'],
    ['itinerary ready overrides stage', { stage: 'matched', has_itinerary: true }, '/dashboard'],
  ])('stageCta: %s -> %s', (_label, overrides, expectedTo) => {
    expect(stageCta(trip(overrides)).to).toBe(expectedTo);
  });

  it.each([
    ['planning with a day_plan already', { stage: 'planning', has_day_plan: true }, '/trip-preview'],
    ['plan_ready without has_day_plan', { stage: 'plan_ready' }, '/trip-preview'],
    ['matching with an existing recommendation', { stage: 'matching', has_recommendation: true }, '/destinations'],
    ['matching with no recommendation', { stage: 'matching', has_recommendation: false }, '/scout-chat'],
  ])('stageCta artifact-based routing: %s -> %s', (_label, overrides, expectedTo) => {
    expect(stageCta(trip(overrides)).to).toBe(expectedTo);
  });
});

describe('tripStatusLine', () => {
  it('itinerary ready always wins, regardless of stage', () => {
    expect(tripStatusLine(trip({ stage: 'planning', has_itinerary: true }))).toBe('Your full trip plan is ready to book and go.');
  });

  it('stage done reads as completed', () => {
    expect(tripStatusLine(trip({ stage: 'done' }))).toBe('This trip has wrapped up.');
  });

  it('no destination, no context at all', () => {
    expect(tripStatusLine(trip({}))).toBe('Just getting started.');
  });

  it('no destination, but some context exists', () => {
    expect(tripStatusLine(trip({ context: { origin_city: 'Delhi' } }))).toBe("Still figuring out where you're headed.");
  });

  it('destination known via the composed recap', () => {
    expect(tripStatusLine(trip({ context: { destinations: 'Udaipur' } }))).toBe('Destination settled — planning not started yet.');
  });

  it('destination known + awaiting', () => {
    expect(tripStatusLine(trip({ context: { destinations: 'Udaipur' }, awaiting: 'trip_duration' }))).toBe("Guide's working out the details with you.");
  });

  it('destination known + has_places', () => {
    expect(tripStatusLine(trip({ context: { destinations: 'Udaipur' }, has_places: true }))).toBe('Places picked — building the day-by-day plan.');
  });

  it('destination known + has_day_plan takes priority', () => {
    expect(tripStatusLine(trip({
      context: { destinations: 'Udaipur' }, awaiting: 'x', has_places: true, has_day_plan: true,
    }))).toBe('A full day-by-day plan is set — sorting out bookings next.');
  });
});

describe('relativeUpdatedAt', () => {
  afterEach(() => vi.useRealTimers());

  it('returns null for a missing or invalid date', () => {
    expect(relativeUpdatedAt(null)).toBeNull();
    expect(relativeUpdatedAt(undefined)).toBeNull();
    expect(relativeUpdatedAt('not-a-date')).toBeNull();
  });

  it('under an hour: "updated just now"', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'));
    expect(relativeUpdatedAt('2026-08-19T11:45:00Z')).toBe('updated just now');
  });

  it('under a day: "updated Xh ago"', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'));
    expect(relativeUpdatedAt('2026-08-19T08:00:00Z')).toBe('updated 4h ago');
  });

  it('under 30 days: "updated Xd ago"', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'));
    expect(relativeUpdatedAt('2026-08-16T12:00:00Z')).toBe('updated 3d ago');
  });

  it('30+ days: falls back to an absolute date', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00Z'));
    expect(relativeUpdatedAt('2026-06-01T12:00:00Z')).toBe('updated Jun 1, 2026');
  });
});

describe('context recap formatters', () => {
  it('contextRecapPills prefixes origin and drops the destination', () => {
    const t = trip({ context: { origin_city: 'Bengaluru', budget: 'INR 50000', destinations: 'Goa' } });
    expect(contextRecapPills(t)).toEqual(['From Bengaluru', 'INR 50000']);
  });

  it('contextDestination reads the destinations recap item', () => {
    expect(contextDestination(trip({ context: { destinations: 'Goa' } }))).toBe('Goa');
    expect(contextDestination(trip({}))).toBeNull();
  });
});
