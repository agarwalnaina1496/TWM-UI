import { describe, it, expect } from 'vitest';
import { isTripEmpty, isItineraryReady, isCompletedTrip, stageBadge, stageCta } from '../../../src/lib/tripLifecycle.js';

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
    ['planned', { stage: 'planned' }, '/dashboard'],
    ['itinerary ready overrides stage', { stage: 'matched', itinerary_state: { status: 'ready' } }, '/dashboard'],
  ])('stageCta: %s -> %s', (_label, overrides, expectedTo) => {
    expect(stageCta(state(overrides)).to).toBe(expectedTo);
  });
});

