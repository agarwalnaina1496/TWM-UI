import { describe, it, expect } from 'vitest';
import { contextFactRows, dashboardPrimaryCta } from '../../../src/lib/dashboardTracks.js';

describe('contextFactRows (TWM-182)', () => {
  it('returns labeled Origin/Duration/No. of travelers rows in order, skipping absent fields', () => {
    const rows = contextFactRows({ origin: 'Bengaluru', duration_days: 5, travelers: 2 });
    expect(rows).toEqual([
      { label: 'Origin', value: 'Bengaluru' },
      { label: 'Duration', value: '5 days' },
      { label: 'No. of travelers', value: '2' },
    ]);
  });

  it('includes a Budget row when present, and omits it when absent', () => {
    expect(contextFactRows({ origin: 'Delhi', budget: '₹1,00,000 total for both' })).toEqual([
      { label: 'Origin', value: 'Delhi' },
      { label: 'Budget', value: '₹1,00,000 total for both' },
    ]);
    expect(contextFactRows({ origin: 'Delhi' }).some(row => row.label === 'Budget')).toBe(false);
  });

  it('shows only Dates (no Duration) when exact dates are known, even if duration_days is also present', () => {
    const rows = contextFactRows({ travel_window: 'Dec–Jan', month: 'December', duration_days: 20 });
    expect(rows).toEqual([{ label: 'Dates', value: 'Dec–Jan' }]);
  });

  it('prefers travel_window over a bare dates string when both are present', () => {
    const rows = contextFactRows({ travel_window: 'Dec–Jan', dates: '5-10 Dec' });
    expect(rows).toEqual([{ label: 'Dates', value: 'Dec–Jan' }]);
  });

  it('a bare dates string alone also counts as exact dates — no Duration row alongside it', () => {
    const rows = contextFactRows({ dates: 'Early Dec', duration_days: 5 });
    expect(rows).toEqual([{ label: 'Dates', value: 'Early Dec' }]);
  });

  it('falls back to Month + Duration together when no exact dates are known', () => {
    const rows = contextFactRows({ month: 'September', duration_days: 5 });
    expect(rows).toEqual([
      { label: 'Month', value: 'September' },
      { label: 'Duration', value: '5 days' },
    ]);
  });

  it('returns an empty array for an empty or missing trip_context', () => {
    expect(contextFactRows({})).toEqual([]);
    expect(contextFactRows(undefined)).toEqual([]);
  });

  it('singularizes "1 day" but not "2 days"', () => {
    expect(contextFactRows({ duration_days: 1 })).toEqual([{ label: 'Duration', value: '1 day' }]);
    expect(contextFactRows({ duration_days: 2 })).toEqual([{ label: 'Duration', value: '2 days' }]);
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
    expect(cta).toEqual({ label: 'Continue chat', to: '/trip-preview' });
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
});
