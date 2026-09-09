import { describe, it, expect } from 'vitest';
import { monthLabel, dayLabel, todayIso } from '../../../../src/lib/booking/dateLabels.js';

// TWM-228: the labels parse from split parts and build a local-time Date, so a
// stored date is never shifted a day back for a viewer west of UTC.
describe('monthLabel', () => {
  it('formats a YYYY-MM string', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
  });
  it('passes an unparseable value through and handles nullish', () => {
    expect(monthLabel('')).toBeNull();
    expect(monthLabel(null)).toBeNull();
    expect(monthLabel('later')).toBe('later');
  });
});

describe('dayLabel', () => {
  it('formats a YYYY-MM-DD string without a timezone shift', () => {
    expect(dayLabel('2026-09-26')).toBe('Sep 26');
    // The day is taken verbatim — no UTC-midnight rollback.
    expect(dayLabel('2026-01-01')).toBe('Jan 1');
  });
  it('handles nullish / unparseable', () => {
    expect(dayLabel(null)).toBeNull();
    expect(dayLabel('flexible')).toBe('flexible');
  });
});

describe('todayIso', () => {
  it('returns a local YYYY-MM-DD matching the current date parts', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayIso()).toBe(expected);
  });
});
