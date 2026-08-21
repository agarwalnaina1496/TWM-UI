import { describe, it, expect } from 'vitest';
import { contextFactRows, dashboardPrimaryCta } from '../../../src/lib/dashboardTracks.js';

describe('contextFactRows (TWM-182, TWM-190 canonical fields)', () => {
  it('returns labeled Origin/Duration/No. of travelers rows in order, skipping absent fields', () => {
    const rows = contextFactRows({ origin_city: 'Bengaluru', trip_duration: 5, num_travelers: 2 });
    expect(rows).toEqual([
      { label: 'Origin', value: 'Bengaluru' },
      { label: 'Duration', value: '5 days' },
      { label: 'No. of travelers', value: '2' },
    ]);
  });

  it('includes a Budget row when present, and omits it when absent', () => {
    expect(contextFactRows({ origin_city: 'Delhi', budget: '₹1,00,000 total for both' })).toEqual([
      { label: 'Origin', value: 'Delhi' },
      { label: 'Budget', value: '₹1,00,000 total for both' },
    ]);
    expect(contextFactRows({ origin_city: 'Delhi' }).some(row => row.label === 'Budget')).toBe(false);
  });

  // travel_dates accepts any verbatim form (a month, a range, "flexible") —
  // Duration and Dates are independent facts now, never mutually exclusive
  // the way the old travel_window/month/dates/duration_days split was.
  it('shows Duration and Dates together when both are known', () => {
    const rows = contextFactRows({ travel_dates: 'Dec–Jan', trip_duration: 20 });
    expect(rows).toEqual([
      { label: 'Duration', value: '20 days' },
      { label: 'Dates', value: 'Dec–Jan' },
    ]);
  });

  it('shows Dates alone when only travel_dates is known', () => {
    const rows = contextFactRows({ travel_dates: 'Early Dec' });
    expect(rows).toEqual([{ label: 'Dates', value: 'Early Dec' }]);
  });

  it('returns an empty array for an empty or missing trip_context', () => {
    expect(contextFactRows({})).toEqual([]);
    expect(contextFactRows(undefined)).toEqual([]);
  });

  it('singularizes "1 day" but not "2 days"', () => {
    expect(contextFactRows({ trip_duration: 1 })).toEqual([{ label: 'Duration', value: '1 day' }]);
    expect(contextFactRows({ trip_duration: 2 })).toEqual([{ label: 'Duration', value: '2 days' }]);
  });
});

describe('dashboardPrimaryCta (TWM-182)', () => {
  it("returns Route's CTA when the destination isn't known yet", () => {
    const cta = dashboardPrimaryCta({ stage: 'matching', trip_context: {}, planner_state: null });
    expect(cta).toEqual({ label: 'Continue chat', to: '/scout-chat' });
  });

  it("falls through to Day plan's CTA once Route is done", () => {
    const cta = dashboardPrimaryCta({
      stage: 'planning',
      trip_context: { destinations: ['Udaipur'] },
      planner_state: { conversation_context: { awaiting: 'trip_duration' }, day_plan: [] },
    });
    expect(cta).toEqual({ label: 'Continue chat', to: '/scout-chat' });
  });

  it('returns null once both Route and Day plan are done (frozen)', () => {
    const cta = dashboardPrimaryCta({
      stage: 'planning',
      trip_context: { destinations: ['Udaipur'] },
      planner_state: { conversation_context: { awaiting: null }, day_plan: [{ day: 1 }], frozen_plan: { day: 1 } },
    });
    expect(cta).toBeNull();
  });

  // TWM-188 item 5: the route track's recommended/matched grouping is now
  // imported from tripLifecycle.js's RECOMMENDATIONS_READY_STAGES rather
  // than a second hardcoded literal-string check — confirm both stages
  // still resolve to the destinations-review CTA with no known destination.
  it.each(['recommended', 'matched'])(
    "returns Route's review-recommendations CTA for stage %s with no destination chosen yet",
    stage => {
      const cta = dashboardPrimaryCta({ stage, trip_context: {}, planner_state: null });
      expect(cta).toEqual({ label: 'Review recommendations', to: '/destinations' });
    }
  );

  // TWM-190: a "matching" trip with an existing recommendation round is a
  // refinement awaiting clarification, not a fresh conversation — routes
  // to /destinations, not /scout-chat.
  it('routes matching with an existing recommendation to /destinations, not /scout-chat', () => {
    const cta = dashboardPrimaryCta({
      stage: 'matching', trip_context: {}, planner_state: null, has_recommendation: true,
    });
    expect(cta).toEqual({ label: 'Continue refining', to: '/destinations' });
  });

  it('still routes matching with no recommendation to /scout-chat', () => {
    const cta = dashboardPrimaryCta({
      stage: 'matching', trip_context: {}, planner_state: null, has_recommendation: false,
    });
    expect(cta).toEqual({ label: 'Continue chat', to: '/scout-chat' });
  });
});
