import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BudgetBar, { money, moneyRange } from '../../../src/components/BudgetBar.jsx';

describe('BudgetBar', () => {
  it('money formats INR with no fraction digits', () => {
    expect(money(1600)).toBe('₹1,600');
  });

  it('moneyRange is null unless both ends are present', () => {
    expect(moneyRange(1000, 2000)).toBe('₹1,000–₹2,000');
    expect(moneyRange(null, 2000)).toBeNull();
    expect(moneyRange(1000, null)).toBeNull();
  });

  it('positions the fill within the min/max span', () => {
    const { container } = render(<BudgetBar low={25} high={75} min={0} max={100} />);
    const fill = container.querySelector('.budget-fill');
    expect(fill.style.left).toBe('25%');
    expect(fill.style.width).toBe('50%');
  });

  it('clamps a zero-width range to a visible minimum', () => {
    const { container } = render(<BudgetBar low={50} high={50} min={0} max={100} />);
    expect(container.querySelector('.budget-fill').style.width).toBe('3%');
  });
});
