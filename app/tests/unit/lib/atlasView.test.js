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

  // TWM-198/TWM-209: exact board_item_id matching, once an anchor carries one.
  describe('board_item_id exact matching (TWM-209)', () => {
    // Two bookable items on the same day — the real case day-only matching
    // could get wrong (confirming one falsely "readies" the other too).
    const twoBookableSameDay = [
      { day_number: 1, timeline: [
        { title: 'Flight', requires_advance_booking: true },
        { title: 'Safari', requires_advance_booking: true },
      ] },
    ];

    it('marks only the exact matching item ready when the anchor carries a board_item_id', () => {
      // index 0 on day 1 -> "trip-1:1:0" (the Flight, not the Safari).
      const anchors = [{ id: 'a1', type: 'transport', day_number: 1, board_item_id: 'trip-1:1:0' }];
      expect(bookingReadinessRollup(twoBookableSameDay, anchors, 'trip-1')).toEqual({ ready: 1, total: 2 });
    });

    it('never lets a board_item_id-carrying anchor satisfy a different same-day item via day-only fallback', () => {
      // Anchor's board_item_id points at index 1 (Safari) — Flight (index 0)
      // must stay unready, unlike the old day-only behavior which would
      // have marked both ready off a single same-day anchor.
      const anchors = [{ id: 'a1', type: 'transport', day_number: 1, board_item_id: 'trip-1:1:1' }];
      expect(bookingReadinessRollup(twoBookableSameDay, anchors, 'trip-1')).toEqual({ ready: 1, total: 2 });
    });

    it('falls back to day-only matching only for an anchor with no board_item_id at all (legacy data)', () => {
      const anchors = [{ id: 'a1', type: 'transport', day_number: 1 }];
      // Legacy anchor carries no board_item_id, so it satisfies day 1 by the
      // original day-only rule — both same-day items read ready, same as
      // pre-TWM-209 behavior for anchors without one.
      expect(bookingReadinessRollup(twoBookableSameDay, anchors, 'trip-1')).toEqual({ ready: 2, total: 2 });
    });

    it('a mix of one exact-matching anchor and one legacy anchor does not double-count', () => {
      const anchors = [
        { id: 'a1', type: 'transport', day_number: 1, board_item_id: 'trip-1:1:0' },
        { id: 'a2', type: 'activity', day_number: 1 },
      ];
      // Legacy anchor's day-only match already covers both items; adding
      // the exact-matching one on top must not change the total ready count.
      expect(bookingReadinessRollup(twoBookableSameDay, anchors, 'trip-1')).toEqual({ ready: 2, total: 2 });
    });
  });
});
