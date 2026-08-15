import { describe, expect, it } from 'vitest';
import { recommendationViewModel, safeRecommendationViewModel, rollupCounts, rollupSummary } from '../../../src/lib/recommendationViewModel.js';

function response() {
  return {
    status: 'SUCCESS',
    message: 'Ranked for you.',
    traveler_criteria: [
      { id: 'budget', label: 'Budget', requirement_type: 'HARD', source_context_paths: ['budget'] },
      { id: 'pace', label: 'Pace', requirement_type: 'PREFERENCE', source_context_paths: ['travel_style.pace'] },
    ],
    options: [{
      rank: 1,
      type: 'single',
      name: 'Pondicherry',
      destination_id: 'pondicherry',
      summary: 'A strong fit.',
      evaluations: [
        { criterion_id: 'budget', outcome: 'MATCH', conclusion: 'Fits.', details: [{ type: 'cost_breakdown', currency: 'INR', items: [{ label: 'Stay', per_person: { minimum: 1000, maximum: 2000 } }] }] },
        { criterion_id: 'pace', outcome: 'MATCH', conclusion: 'Relaxed.', details: [{ type: 'bullets', items: ['Easy days'] }] },
      ],
      other_considerations: [],
    }],
  };
}

describe('recommendationViewModel', () => {
  it('joins criteria and attaches UI metadata outside the canonical response', () => {
    const payload = response();
    const result = recommendationViewModel(payload, { pondicherry: { places: null } });

    expect(result.options[0].key).toBe('pondicherry');
    expect(result.options[0].evaluations[0].criterion.label).toBe('Budget');
    expect(result.options[0].prototype).toEqual({ places: null });
    expect(payload.options[0]).not.toHaveProperty('prototype');
  });

  it('rejects ambiguous option identity', () => {
    const payload = response();
    payload.options[0].circuit_id = 'also-a-circuit';
    expect(() => recommendationViewModel(payload)).toThrow(/identity or rank/);
  });

  it('rejects duplicate, missing, or unknown criterion evaluations', () => {
    const duplicate = response();
    duplicate.options[0].evaluations[1].criterion_id = 'budget';
    expect(() => recommendationViewModel(duplicate)).toThrow(/references or details/);

    const missing = response();
    missing.options[0].evaluations.pop();
    expect(() => recommendationViewModel(missing)).toThrow(/incomplete/);

    const unknown = response();
    unknown.options[0].evaluations[1].criterion_id = 'unknown';
    expect(() => recommendationViewModel(unknown)).toThrow(/references or details/);
  });

  it('rejects malformed cost ranges', () => {
    const payload = response();
    payload.options[0].evaluations[0].details[0].items[0].per_person = { minimum: 2000, maximum: 1000 };
    expect(() => recommendationViewModel(payload)).toThrow(/references or details/);
  });

  it('returns a safe failure instead of partially rendering malformed data', () => {
    const result = safeRecommendationViewModel({ status: 'SUCCESS', traveler_criteria: [], options: [] });
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/criteria/i);
  });
});

describe('rollupCounts / rollupSummary (TWM-173)', () => {
  const evaluations = [
    { outcome: 'MATCH' }, { outcome: 'MATCH' }, { outcome: 'TRADEOFF' }, { outcome: 'MISMATCH' },
  ];

  it('counts each outcome without inventing a number the agent never declared', () => {
    expect(rollupCounts(evaluations)).toEqual({ MATCH: 2, TRADEOFF: 1, MISMATCH: 1 });
  });

  it('summarizes only the outcomes actually present, correctly pluralized', () => {
    expect(rollupSummary(evaluations)).toBe('2 matches · 1 trade-off · 1 mismatch');
    expect(rollupSummary([{ outcome: 'MATCH' }])).toBe('1 match');
  });

  it('returns an empty summary for no evaluations', () => {
    expect(rollupSummary([])).toBe('');
    expect(rollupCounts([])).toEqual({ MATCH: 0, TRADEOFF: 0, MISMATCH: 0 });
  });
});
