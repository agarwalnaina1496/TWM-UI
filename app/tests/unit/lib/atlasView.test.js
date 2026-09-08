import { describe, it, expect } from 'vitest';
import { verificationTone, timelineIcon, bookingReadinessLabel, dayCostRange } from '../../../src/lib/atlasView.js';

describe('verificationTone', () => {
  it('maps VERIFIED to positive and GENERAL_GUIDANCE to neutral', () => {
    expect(verificationTone('VERIFIED')).toBe('positive');
    expect(verificationTone('GENERAL_GUIDANCE')).toBe('neutral');
  });

  it('falls back to neutral for an unrecognized status', () => {
    expect(verificationTone('unknown')).toBe('neutral');
  });
});

describe('timelineIcon', () => {
  it('maps known kinds and falls back to the activity pin', () => {
    expect(timelineIcon('STAY')).toBe('🏨');
    expect(timelineIcon('TRAVEL')).toBe('🚗');
    expect(timelineIcon('WHATEVER')).toBe('📍');
  });
});

describe('bookingReadinessLabel', () => {
  it('labels the two surviving statuses (TWM-217 dropped "unresolved")', () => {
    expect(bookingReadinessLabel('suggested')).toBe('Suggested');
    expect(bookingReadinessLabel('needs_advance_booking')).toBe('Needs advance booking');
    expect(bookingReadinessLabel('anything_else')).toBe('anything_else');
  });
});

describe('dayCostRange', () => {
  it('sums per-item estimated cost bounds across a day', () => {
    const day = { timeline: [
      { estimated_cost_low: 100, estimated_cost_high: 200 },
      { estimated_cost_low: 50, estimated_cost_high: 75 },
      { title: 'no cost' },
    ] };
    expect(dayCostRange(day)).toEqual({ low: 150, high: 275 });
  });
});
