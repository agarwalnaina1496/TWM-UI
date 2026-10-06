import { describe, expect, it } from 'vitest';
import { formatBudget } from '../../../src/lib/formatBudget.js';

describe('formatBudget', () => {
  it.each([
    ['25000 to 26000 INR', '₹25k–26k'],
    ['25,000 - 26,000', '₹25k–26k'],
    ['50,000 INR', '₹50k'],
    ['50k total budget', '₹50k total'],
    ['1 lakh INR', '₹1L'],
    ['1.5 lakhs', '₹1.5L'],
    ['₹90,000 to 1.2 lakh', '₹90k–1.2L'],
    ['Rs. 800', '₹800'],
    ['2 crore', '₹2Cr'],
    ['50000 per person', '₹50k per person'],
    ['up to 40000', 'Up to ₹40k'],
    ['approx 25000 INR total', '₹25k total'],
  ])('%s -> %s', (written, shown) => {
    expect(formatBudget(written)).toBe(shown);
  });

  it.each([
    ['Tight'], ['flexible'], [''], [null], ['$2,000'], ['2000 USD'],
    ['around 1 lakh for 2 people'], ['25000 to 26000 to 27000'], ['whatever works'],
  ])('leaves %s to the traveler\'s own words', written => {
    expect(formatBudget(written)).toBeNull();
  });
});
