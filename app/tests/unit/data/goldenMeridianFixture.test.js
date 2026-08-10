import { describe, expect, it } from 'vitest';
import { GOLDEN_MERIDIAN_METADATA, goldenMeridianFixture } from '../../../src/data/goldenMeridianFixture.js';
import { recommendationViewModel } from '../../../src/lib/recommendationViewModel.js';

describe('golden Meridian journey fixture', () => {
  it('validates the exact ranked MP, Kerala and Assam–Meghalaya circuits', () => {
    const result = recommendationViewModel(goldenMeridianFixture(), GOLDEN_MERIDIAN_METADATA);
    expect(result.message).toMatch(/^Madhya Pradesh is the strongest overall match/);
    expect(result.options.map(option => option.name)).toEqual([
      'Madhya Pradesh Heritage and Nature',
      'Kerala Culture, Backwaters and Coast',
      'Assam–Meghalaya Nature and Culture',
    ]);
    expect(result.options.every(option => option.evaluations.length === 5)).toBe(true);
    expect(result.options[0].prototype.estimated_group).toEqual([60000, 82000]);
  });

  it('refreshes around a reference option without changing the criteria', () => {
    const result = recommendationViewModel(
      goldenMeridianFixture('guwahati-kaziranga-shillong-cherrapunji'),
      GOLDEN_MERIDIAN_METADATA,
    );
    expect(result.options[0].name).toBe('Assam–Meghalaya Nature and Culture');
    expect(result.criteria).toHaveLength(5);
  });
});
