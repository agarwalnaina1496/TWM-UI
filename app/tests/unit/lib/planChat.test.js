import { describe, it, expect } from 'vitest';
import { FIXED_FIELDS, isFixedFieldGap, buildPlanRecapTurn } from '../../../src/lib/planChat.js';

describe('isFixedFieldGap', () => {
  it('is true for each of Guide\'s five fixed checklist fields', () => {
    for (const field of FIXED_FIELDS) expect(isFixedFieldGap(field)).toBe(true);
  });

  it('is false for the open "anything else" gate and no-gap states', () => {
    expect(isFixedFieldGap('anything_else')).toBe(false);
    expect(isFixedFieldGap(null)).toBe(false);
    expect(isFixedFieldGap(undefined)).toBe(false);
  });

  it('is false for an unrelated awaiting value (e.g. Meridian\'s own gate)', () => {
    expect(isFixedFieldGap('style')).toBe(false);
  });
});

describe('buildPlanRecapTurn', () => {
  it('returns null when there is no persisted context yet', () => {
    expect(buildPlanRecapTurn(undefined)).toBeNull();
    expect(buildPlanRecapTurn({})).toBeNull();
  });

  it('recaps the destination and known facts', () => {
    const text = buildPlanRecapTurn({ destinations: ['Coorg'], origin: 'Delhi' });
    expect(text).toContain('Picking up where you left off');
    expect(text).toContain('Coorg');
    expect(text).toContain('From Delhi');
  });

  it('falls back to generic phrasing when no destination is known yet', () => {
    const text = buildPlanRecapTurn({ origin: 'Delhi' });
    expect(text).toContain('planning your trip');
  });

  it('appends the still-needed fixed field, but not for the open "anything else" gate', () => {
    const withGap = buildPlanRecapTurn({ destinations: ['Coorg'] }, { awaiting: 'num_travelers' });
    expect(withGap).toContain('num travelers');

    const withAnythingElse = buildPlanRecapTurn({ destinations: ['Coorg'] }, { awaiting: 'anything_else' });
    expect(withAnythingElse).not.toContain('anything else —');
  });
});
