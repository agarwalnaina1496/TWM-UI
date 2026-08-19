import { describe, it, expect } from 'vitest';
import { contextFactRows, dashboardPrimaryCta } from '../../../src/lib/dashboardTracks.js';

describe('contextFactRows (TWM-182)', () => {
  it('returns labeled Origin/Dates/Duration/Travelers rows in order, skipping absent fields', () => {
    const rows = contextFactRows({ origin: 'Bengaluru', duration_days: 5, travelers: 2 });
    expect(rows).toEqual([
      { label: 'Origin', value: 'Bengaluru' },
      { label: 'Duration', value: '5 days' },
      { label: 'Travelers', value: '2' },
    ]);
  });

  it('never includes a Budget row — shown as its own chip near the Overview heading instead', () => {
    const rows = contextFactRows({ origin: 'Delhi', budget: '₹1,00,000 total for both' });
    expect(rows.some(row => row.label === 'Budget')).toBe(false);
  });

  it('prefers travel_window over month/dates as the single Dates row when multiple are present', () => {
    const rows = contextFactRows({ travel_window: 'Dec–Jan', month: 'December', dates: '5-10 Dec' });
    expect(rows).toEqual([{ label: 'Dates', value: 'Dec–Jan' }]);
  });

  it('falls back to month, then dates, for the Dates row when travel_window is absent', () => {
    expect(contextFactRows({ month: 'September' })).toEqual([{ label: 'Dates', value: 'September' }]);
    expect(contextFactRows({ dates: 'Early Dec' })).toEqual([{ label: 'Dates', value: 'Early Dec' }]);
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
});
