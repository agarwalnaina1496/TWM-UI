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

  // TWM-171: stageCta() now routes every stage to /dashboard with one
  // literal "Open trip →" label — Dashboard is reachable from message one
  // and itself carries the traveler into whichever Build screen applies.
  it.each([
    ['new, no context', {}],
    ['new, has context', { trip_context: { origin: 'Delhi' } }],
    ['matching', { stage: 'matching' }],
    ['recommendation_ready', { stage: 'recommendation_ready' }],
    ['recommended', { stage: 'recommended' }],
    ['matched', { stage: 'matched' }],
    ['planning', { stage: 'planning' }],
    ['planned', { stage: 'planned' }],
    ['itinerary ready overrides stage', { stage: 'matched', itinerary_state: { status: 'ready' } }],
  ])('stageCta: %s always routes to /dashboard with the "Open trip →" label', (_label, overrides) => {
    expect(stageCta(state(overrides))).toEqual({ label: 'Open trip →', to: '/dashboard' });
  });
});

