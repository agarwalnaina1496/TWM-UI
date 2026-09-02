import { describe, it, expect } from 'vitest';
import { verificationTone, trustStripCounts, bookingReadinessRollup } from '../../../src/lib/atlasView.js';

describe('verificationTone', () => {
  it('maps VERIFIED to positive and GENERAL_GUIDANCE to neutral', () => {
    expect(verificationTone('VERIFIED')).toBe('positive');
    expect(verificationTone('GENERAL_GUIDANCE')).toBe('neutral');
  });

  it('falls back to neutral for an unrecognized status', () => {
    expect(verificationTone('unknown')).toBe('neutral');
  });
});

function reference(status) {
  return { status, source_title: status === 'VERIFIED' ? 'Source' : null, source_url: status === 'VERIFIED' ? 'https://example.com' : null };
}

describe('trustStripCounts', () => {
  it('aggregates assumptions, unresolved items, and verified/general-guidance across all timeline items and practical notes', () => {
    const finalItinerary = {
      assumptions: [{ category: 'dates', detail: 'x' }],
      practical_notes: [{ category: 'weather', title: 'x', detail: 'y', reference: reference('VERIFIED') }],
      days: [
        { day_number: 1, timeline: [{ title: 'a', reference: reference('VERIFIED') }, { title: 'b', reference: reference('GENERAL_GUIDANCE') }] },
        { day_number: 2, timeline: [{ title: 'c', reference: reference('GENERAL_GUIDANCE') }] },
      ],
    };
    const result = { unresolved: [{ item: 'x', generic_guidance: 'y' }, { item: 'z', generic_guidance: 'w' }] };

    expect(trustStripCounts(finalItinerary, result)).toEqual({
      assumptionsCount: 1,
      unresolvedCount: 2,
      verifiedCount: 2,
      generalGuidanceCount: 2,
    });
  });

  it('handles missing/empty data without crashing', () => {
    expect(trustStripCounts({}, {})).toEqual({ assumptionsCount: 0, unresolvedCount: 0, verifiedCount: 0, generalGuidanceCount: 0 });
    expect(trustStripCounts(undefined, undefined)).toEqual({ assumptionsCount: 0, unresolvedCount: 0, verifiedCount: 0, generalGuidanceCount: 0 });
  });
});

// TWM-216: the confirmed-logistics anchor concept is gone; the rollup is
// driven entirely by Atlas's own per-item booking_readiness label.
describe('bookingReadinessRollup', () => {
  it('counts a bookable item as ready only when Atlas marked it "suggested"', () => {
    const days = [
      { day_number: 1, timeline: [
        { title: 'Flight', requires_advance_booking: true, booking_readiness: 'suggested' },
        { title: 'Walk', requires_advance_booking: false },
      ] },
      { day_number: 2, timeline: [{ title: 'Train', requires_advance_booking: true, booking_readiness: 'needs_advance_booking' }] },
    ];
    expect(bookingReadinessRollup(days)).toEqual({ ready: 1, total: 2 });
  });

  it('is 0 of N when every bookable item still needs attention', () => {
    const days = [
      { day_number: 1, timeline: [{ title: 'Flight', requires_advance_booking: true, booking_readiness: 'unresolved' }] },
      { day_number: 2, timeline: [{ title: 'Train', requires_advance_booking: true, booking_readiness: 'needs_advance_booking' }] },
    ];
    expect(bookingReadinessRollup(days)).toEqual({ ready: 0, total: 2 });
  });

  it('is 0 of 0 when nothing on the trip requires advance booking', () => {
    const noBookable = [{ day_number: 1, timeline: [{ title: 'Walk', requires_advance_booking: false }] }];
    expect(bookingReadinessRollup(noBookable)).toEqual({ ready: 0, total: 0 });
  });
});
