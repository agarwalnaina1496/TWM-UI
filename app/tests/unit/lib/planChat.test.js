import { describe, it, expect } from 'vitest';
import { FIXED_FIELDS, isFixedFieldGap, buildPlanRecapTurn } from '../../../src/lib/planChat.js';

// TWM-220: buildPlanRecapTurn takes a `TripView` (composed context_recap).
function recap(entries) {
  return Object.entries(entries).map(([key, value]) => ({ key, label: key, value }));
}
const view = context => ({ context_recap: recap(context) });

describe('isFixedFieldGap', () => {
  it("is true for each of Guide's five fixed checklist fields", () => {
    for (const field of FIXED_FIELDS) expect(isFixedFieldGap(field)).toBe(true);
  });

  it('is false for the open "anything else" gate and no-gap states', () => {
    expect(isFixedFieldGap('anything_else')).toBe(false);
    expect(isFixedFieldGap(null)).toBe(false);
    expect(isFixedFieldGap(undefined)).toBe(false);
  });

  it('is false for an unrelated awaiting value', () => {
    expect(isFixedFieldGap('style')).toBe(false);
  });
});

describe('buildPlanRecapTurn', () => {
  it('returns null when there is no context yet', () => {
    expect(buildPlanRecapTurn(undefined)).toBeNull();
    expect(buildPlanRecapTurn(view({}))).toBeNull();
  });

  it('recaps the destination and known facts', () => {
    const text = buildPlanRecapTurn(view({ destinations: 'Coorg', origin_city: 'Delhi' }));
    expect(text).toContain('Picking up where you left off');
    expect(text).toContain('Coorg');
    expect(text).toContain('From Delhi');
  });

  it('falls back to generic phrasing when no destination is known yet', () => {
    expect(buildPlanRecapTurn(view({ origin_city: 'Delhi' }))).toContain('planning your trip');
  });

  it('appends the still-needed fixed field, but not for "anything else"', () => {
    expect(buildPlanRecapTurn(view({ destinations: 'Coorg' }), { awaiting: 'num_travelers' })).toContain('num travelers');
    expect(buildPlanRecapTurn(view({ destinations: 'Coorg' }), { awaiting: 'anything_else' })).not.toContain('anything else —');
  });
});
