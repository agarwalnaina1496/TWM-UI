import { describe, it, expect } from 'vitest';
import { travelerCount, verificationTone, trustStripCounts, bookingReadinessRollup } from '../../../src/lib/atlasView.js';

describe('travelerCount (TWM-175 field-name bug regression)', () => {
  it('reads the real num_travelers field, not the nonexistent travelers field', () => {
    expect(travelerCount({ num_travelers: 4, travelers: 2 })).toBe(4);
  });

  it('returns null (not a fabricated default) when num_travelers is genuinely unknown', () => {
    expect(travelerCount({})).toBeNull();
    expect(travelerCount(undefined)).toBeNull();
  });
});

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

describe('bookingReadinessRollup', () => {
  const days = [
    { day_number: 1, timeline: [{ title: 'Flight', requires_advance_booking: true }, { title: 'Walk', requires_advance_booking: false }] },
    { day_number: 2, timeline: [{ title: 'Train', requires_advance_booking: true }] },
  ];

  it('counts a bookable item as ready only when a confirmed anchor exists for that day — not from Atlas\'s own booking_readiness label', () => {
    const anchors = [{ id: 'a1', type: 'transport', day_number: 1 }];
    expect(bookingReadinessRollup(days, anchors)).toEqual({ ready: 1, total: 2 });
  });

  it('is 0 of N when nothing is confirmed yet', () => {
    expect(bookingReadinessRollup(days, [])).toEqual({ ready: 0, total: 2 });
  });

  it('is 0 of 0 when nothing on the trip requires advance booking', () => {
    const noBookable = [{ day_number: 1, timeline: [{ title: 'Walk', requires_advance_booking: false }] }];
    expect(bookingReadinessRollup(noBookable, [])).toEqual({ ready: 0, total: 0 });
  });
});
