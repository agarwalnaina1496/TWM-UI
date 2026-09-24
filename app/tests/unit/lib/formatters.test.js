import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyRange } from '../../../src/lib/formatters.js';

describe('formatters', () => {
  it('formats INR with the shared currency strategy', () => {
    expect(formatMoney(32000)).toBe('₹32,000');
  });

  it('formats a money range and preserves null boundaries', () => {
    expect(formatMoneyRange(32000, 45000)).toBe('₹32,000–₹45,000');
    expect(formatMoneyRange(null, 45000)).toBeNull();
  });
});
