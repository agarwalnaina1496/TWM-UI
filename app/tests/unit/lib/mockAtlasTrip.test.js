import { describe, expect, it } from 'vitest';
import { acceptProposedRevision, addUploadedBooking, adjustFlexibleItem, computeBudget, confirmArrival, confirmStay, createAtlasDashboardState, currentAtlasVersion, keepCurrentRevision } from '../../../src/lib/mockAtlasTrip.js';

describe('mock Atlas itinerary and Dashboard contract', () => {
  it('creates a duration-only 14-day immutable first version with computed budget', () => {
    const state = createAtlasDashboardState({ approved_revision: 3, traveler_context: { original_traveler_request: 'exact words' } });
    const version = currentAtlasVersion(state);
    expect(state.date_mode).toBe('duration_only');
    expect(version.days).toHaveLength(14);
    expect(version.created_from).toBe('guide-revision-3');
    expect(Object.isFrozen(version)).toBe(true);
    expect(state.traveler_context.original_traveler_request).toBe('exact words');
    expect(computeBudget(state.cost_items)).toEqual({ low: 60000, high: 82000 });
  });

  it('does not overwrite Days when arrival confirmation proposes a revision', () => {
    const initial = createAtlasDashboardState();
    const originalDays = currentAtlasVersion(initial).days;
    const confirmed = confirmArrival(initial);
    expect(currentAtlasVersion(confirmed).days).toEqual(originalDays);
    expect(confirmed.proposed_revision).toMatchObject({ number: 2, affected_days: [1, 3] });
    expect(confirmed.bookings[0].state).toBe('confirmed');
  });

  it('Keep retains version 1 while Accept makes immutable version 2 current and preserves history', () => {
    const proposed = confirmArrival(createAtlasDashboardState());
    const kept = keepCurrentRevision(proposed);
    expect(kept.current_version_id).toBe('atlas-v1');
    expect(kept.versions).toHaveLength(1);
    const accepted = acceptProposedRevision(proposed);
    expect(accepted.current_version_id).toBe('atlas-v2');
    expect(accepted.versions.map(version => version.status)).toEqual(['HISTORICAL', 'CURRENT']);
    expect(Object.isFrozen(currentAtlasVersion(accepted))).toBe(true);
    expect(currentAtlasVersion(accepted).days[0].items[0]).toMatchObject({ status: 'confirmed', flexibility: 'locked' });
  });

  it('keeps uploaded confirmations honest and can confirm a suggested stay', () => {
    let state = addUploadedBooking(createAtlasDashboardState(), 'Transport');
    expect(state.bookings[0]).toMatchObject({ type: 'Transport', state: 'needs_review', detail: expect.stringContaining('not yet extracted') });
    state = confirmStay(state, 'gwalior-stay');
    expect(state.stays[0].state).toBe('confirmed');
    expect(state.bookings.at(-1).type).toBe('Stay');
  });

  it('creates an immutable version for flexible edits and keeps locked anchors inert', () => {
    const initial = createAtlasDashboardState();
    const adjusted = adjustFlexibleItem(initial, 1, 'd1-2');
    expect(adjusted.current_version_id).toBe('atlas-v2');
    expect(currentAtlasVersion(adjusted).days[0].items[1]).toMatchObject({ status: 'adjusted', title: expect.stringContaining('adjusted') });
    const withLock = acceptProposedRevision(confirmArrival(initial));
    expect(adjustFlexibleItem(withLock, 1, 'd1-arrival')).toBe(withLock);
  });
});
