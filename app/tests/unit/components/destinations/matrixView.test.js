import { describe, it, expect } from 'vitest';
import {
  optionLabel, criterionLabel, criterionIcon, costIcon, accessFact,
} from '../../../../src/components/destinations/matrixView.js';

describe('destinations/matrixView helpers', () => {
  it('optionLabel distinguishes circuit from single', () => {
    expect(optionLabel({ type: 'circuit' })).toBe('Multi-stop circuit');
    expect(optionLabel({ type: 'single' })).toBe('Single destination');
  });

  it('criterionLabel falls back to the id when unknown', () => {
    const criteria = [{ id: 'budget', label: 'Budget fit' }];
    expect(criterionLabel(criteria, 'budget')).toBe('Budget fit');
    expect(criterionLabel(criteria, 'mystery')).toBe('mystery');
  });

  it('criterionIcon and costIcon fall back to a default glyph', () => {
    expect(criterionIcon('budget')).toBe('💰');
    expect(criterionIcon('unknown')).toBe('📌');
    expect(costIcon('Road fuel')).toBe('🚗');
    expect(costIcon('Houseboat stay')).toBe('🏨');
    expect(costIcon('Something else')).toBe('💳');
  });

  it('accessFact returns the first fact whose label reads as access/route info', () => {
    const option = { evaluations: [
      { details: [{ type: 'facts', facts: [
        { label: 'Vibe', value: 'calm' },
        { label: 'Nearest airport', value: 'DED, 20 km' },
      ] }] },
    ] };
    expect(accessFact(option)).toEqual({ label: 'Nearest airport', value: 'DED, 20 km' });
    expect(accessFact({ evaluations: [{ details: [] }] })).toBeNull();
  });
});
