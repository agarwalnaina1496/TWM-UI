import { describe, it, expect } from 'vitest';
import { phaseProgress } from '../../../src/lib/phaseProgress.js';

function view(stage) {
  return { lifecycle: { stage } };
}

describe('phaseProgress', () => {
  it.each([
    ['matching', 'Matching', 0],
    ['recommended', 'Matching', 1],
    ['matched', 'Matching', 2],
    ['planning', 'Planning', 0],
    ['plan_ready', 'Planning', 1],
  ])('%s maps to %s step %i', (stage, label, activeStep) => {
    expect(phaseProgress(view(stage))).toEqual({ label, steps: expect.any(Array), activeStep });
  });

  it.each(['new', 'planned', 'booked', 'done'])('returns null once past both phases or before either starts (%s)', stage => {
    expect(phaseProgress(view(stage))).toBeNull();
  });

  it('never spans both phases in one steps array', () => {
    expect(phaseProgress(view('matching')).steps).toEqual(['In conversation', 'Recommended', 'Matched']);
    expect(phaseProgress(view('planning')).steps).toEqual(['In conversation', 'Draft ready', 'Ready']);
  });
});
