import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isTripEmpty, isItineraryReady, isCompletedTrip, stageBadge, stageCta, tripStatusLine, relativeUpdatedAt,
  contextRecapPills,
} from '../../../src/lib/tripLifecycle.js';

function state(overrides = {}) {
  return { stage: 'new', trip_context: {}, ...overrides };
}

describe('tripLifecycle stage helpers (TWM-108)', () => {
  it.each([
    ['new', {}, true],
    ['new with context', { trip_context: { origin: 'Delhi' } }, false],
    ['matching', { stage: 'matching' }, false],
    ['planned', { stage: 'planned' }, false],
  ])('isTripEmpty: %s', (_label, overrides, expected) => {
    expect(isTripEmpty(state(overrides))).toBe(expected);
  });

  it.each([
    ['ready', { itinerary_state: { status: 'ready' } }, true],
    ['pending', { itinerary_state: { status: 'pending' } }, false],
    ['missing', {}, false],
  ])('isItineraryReady: %s', (_label, overrides, expected) => {
    expect(isItineraryReady(state(overrides))).toBe(expected);
  });

  it('isCompletedTrip is true only for stage done', () => {
    expect(isCompletedTrip(state({ stage: 'done' }))).toBe(true);
    expect(isCompletedTrip(state({ stage: 'planned' }))).toBe(false);
  });

  it.each([
    ['new, no context', {}, 'New'],
    ['new, has context', { trip_context: { origin: 'Delhi' } }, 'In conversation'],
    ['matching', { stage: 'matching' }, 'In conversation'],
    ['recommendation_ready', { stage: 'recommendation_ready' }, 'Ready to generate'],
    ['recommended', { stage: 'recommended' }, 'Recommendations ready'],
    ['matched', { stage: 'matched' }, 'Destination chosen'],
    ['planning', { stage: 'planning' }, 'Planning in progress'],
    ['plan_ready', { stage: 'plan_ready' }, 'Plan drafted'],
    ['planned', { stage: 'planned' }, 'Plan ready'],
    ['booked', { stage: 'booked' }, 'Booked'],
    ['done', { stage: 'done' }, 'Completed'],
    ['itinerary ready overrides stage', { stage: 'planning', itinerary_state: { status: 'ready' } }, 'Itinerary ready'],
  ])('stageBadge: %s -> %s', (_label, overrides, expectedText) => {
    expect(stageBadge(state(overrides)).text).toBe(expectedText);
  });

  it.each([
    ['new, no context', {}, '/'],
    ['new, has context', { trip_context: { origin: 'Delhi' } }, '/scout-chat'],
    ['matching', { stage: 'matching' }, '/scout-chat'],
    ['recommendation_ready', { stage: 'recommendation_ready' }, '/scout-chat'],
    ['recommended', { stage: 'recommended' }, '/destinations'],
    ['matched', { stage: 'matched' }, '/destinations'],
    ['planning', { stage: 'planning' }, '/trip-preview'],
    ['plan_ready', { stage: 'plan_ready' }, '/trip-preview'],
    ['planned', { stage: 'planned' }, '/dashboard'],
    ['itinerary ready overrides stage', { stage: 'matched', itinerary_state: { status: 'ready' } }, '/dashboard'],
  ])('stageCta: %s -> %s', (_label, overrides, expectedTo) => {
    expect(stageCta(state(overrides)).to).toBe(expectedTo);
  });
});

// TWM-184: My Trips card status line — deliberately prose, not a fixed-slot
// indicator. Covers both list-summary shape (awaiting/has_day_plan/
// has_places flat on trip_state) and the destination-resolution paths
// (selected_option vs. destinations array).
describe('tripStatusLine (TWM-184)', () => {
  it('itinerary ready always wins, regardless of stage', () => {
    expect(tripStatusLine(state({ stage: 'planning', itinerary_state: { status: 'ready' } }))).toBe('Your full trip plan is ready to book and go.');
  });

  it('stage done (no itinerary_state) reads as completed', () => {
    expect(tripStatusLine(state({ stage: 'done' }))).toBe('This trip has wrapped up.');
  });

  it('no destination, no context at all: "Just getting started."', () => {
    expect(tripStatusLine(state({}))).toBe('Just getting started.');
  });

  it('no destination, but some context exists: "still figuring out"', () => {
    expect(tripStatusLine(state({ trip_context: { origin: 'Delhi' } }))).toBe("Still figuring out where you're headed.");
  });

  it('destination known via selected_option', () => {
    const line = tripStatusLine(state({ trip_context: { selected_option: { name: 'Coorg' } } }));
    expect(line).toBe('Destination settled — planning not started yet.');
  });

  it('destination known via destinations array (known-destination entry path)', () => {
    const line = tripStatusLine(state({ trip_context: { destinations: ['Udaipur'] } }));
    expect(line).toBe('Destination settled — planning not started yet.');
  });

  it('destination known + awaiting: Guide is actively gathering details', () => {
    const line = tripStatusLine(state({ trip_context: { destinations: ['Udaipur'] }, awaiting: 'trip_duration' }));
    expect(line).toBe("Guide's working out the details with you.");
  });

  it('destination known + has_places (no day plan yet)', () => {
    const line = tripStatusLine(state({ trip_context: { destinations: ['Udaipur'] }, has_places: true }));
    expect(line).toBe('Places picked — building the day-by-day plan.');
  });

  it('destination known + has_day_plan takes priority over has_places/awaiting', () => {
    const line = tripStatusLine(state({
      trip_context: { destinations: ['Udaipur'] }, awaiting: 'x', has_places: true, has_day_plan: true,
    }));
    expect(line).toBe('A full day-by-day plan is set — sorting out bookings next.');
  });
});

describe('relativeUpdatedAt (TWM-184)', () => {
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

describe('contextRecapPills (TWM-183)', () => {
  // origin_city is where Meridian's own extraction (and the known-
  // destination entry path) sometimes lands the origin — was previously
  // invisible to every RECAP_FIELDS-based caller (My Trips cards, the
  // Discover-chat fallback recap) whenever a trip's origin only existed
  // under this key instead of the plain `origin` field.
  it('recognizes origin_city, not just origin', () => {
    expect(contextRecapPills({ origin_city: 'Bengaluru' })).toContain('From Bengaluru');
  });

  it('still recognizes the plain origin field', () => {
    expect(contextRecapPills({ origin: 'Delhi' })).toContain('From Delhi');
  });
});

