import { describe, it, expect } from 'vitest';
import { contextFactRows, dashboardPrimaryCta } from '../../../src/lib/dashboardTracks.js';

// TWM-220: dashboardTracks reads a full `TripView` — one shape, no
// full-vs-thin planner branch. `context_recap` is composed server-side
// (label + value per field); `contextFactRows` just drops the destination.
function recap(entries) {
  return Object.entries(entries).map(([key, value]) => ({ key, label: keyLabel(key), value }));
}
function keyLabel(key) {
  return { origin_city: 'Coming from', trip_duration: 'Trip length', num_travelers: 'Travellers', travel_dates: 'When', budget: 'Budget', destinations: 'Destination' }[key] || key;
}
function view({ stage = 'new', context = {}, plan = null, matcher = {} } = {}) {
  return { lifecycle: { stage }, context_recap: recap(context), plan, matcher };
}

describe('contextFactRows', () => {
  it('returns the composed label/value rows in order, dropping the destination', () => {
    const rows = contextFactRows(view({ context: { origin_city: 'Bengaluru', trip_duration: '5', num_travelers: '2', destinations: 'Goa' } }));
    expect(rows).toEqual([
      { label: 'Coming from', value: 'Bengaluru' },
      { label: 'Trip length', value: '5' },
      { label: 'Travellers', value: '2' },
    ]);
  });

  it('returns an empty array for an empty or missing view', () => {
    expect(contextFactRows(view({}))).toEqual([]);
    expect(contextFactRows(undefined)).toEqual([]);
  });
});

describe('dashboardPrimaryCta', () => {
  it("returns Route's CTA when the destination isn't known yet", () => {
    expect(dashboardPrimaryCta(view({ stage: 'matching' }))).toEqual({ label: 'Continue chat', to: '/scout-chat' });
  });

  it("falls through to Day plan's CTA once Route is done", () => {
    expect(dashboardPrimaryCta(view({
      stage: 'planning',
      context: { destinations: 'Udaipur' },
      plan: { awaiting: 'trip_duration', day_plan: [], places: [], frozen: false },
    }))).toEqual({ label: 'Continue chat', to: '/scout-chat' });
  });

  it('returns null once both Route and Day plan are done (frozen)', () => {
    expect(dashboardPrimaryCta(view({
      stage: 'planned',
      context: { destinations: 'Udaipur' },
      plan: { awaiting: null, day_plan: [{ day_number: 1 }], places: ['x'], frozen: true },
    }))).toBeNull();
  });

  it.each(['recommended', 'matched'])(
    "returns Route's review-recommendations CTA for stage %s with no destination yet",
    stage => {
      expect(dashboardPrimaryCta(view({ stage }))).toEqual({ label: 'Review recommendations', to: '/destinations' });
    }
  );

  it('routes matching with an existing recommendation to /destinations', () => {
    expect(dashboardPrimaryCta(view({ stage: 'matching', matcher: { has_recommendation: true } })))
      .toEqual({ label: 'Continue refining', to: '/destinations' });
  });

  it('still routes matching with no recommendation to /scout-chat', () => {
    expect(dashboardPrimaryCta(view({ stage: 'matching', matcher: { has_recommendation: false } })))
      .toEqual({ label: 'Continue chat', to: '/scout-chat' });
  });
});
