import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import HonestTransition from '../../../../src/components/ui/HonestTransition.jsx';

const STEPS = ['Reviewing what you told us', 'Matching against real destinations', 'Ranking by fit'];

describe('HonestTransition (TWM-173)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never marks the final step done on its own, however long the timer runs — completion is caller-signaled by unmounting', () => {
    render(<HonestTransition steps={STEPS} label="Finding your matches" />);
    // Advance in increments — chained setState-driven timers only get
    // (re)scheduled once React flushes the effect between renders, which a
    // single huge jump wouldn't give a chance to happen.
    for (let i = 0; i < 60; i++) {
      act(() => { vi.advanceTimersByTime(1_000); });
    }

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveClass('done');
    expect(items[1]).toHaveClass('done');
    // The last step holds at "active" indefinitely, never "done".
    expect(items[2]).toHaveClass('active');
    expect(items[2]).not.toHaveClass('done');
  });

  it('honors a slower stepDurationMs for long-running callers', () => {
    render(<HonestTransition steps={STEPS} label="Finding your matches" stepDurationMs={30_000} />);
    act(() => { vi.advanceTimersByTime(1_100); });

    // At the default 1100ms cadence this would already be on step 2 — a
    // slower cadence must not have advanced past the first step yet.
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveClass('active');
    expect(items[1]).not.toHaveClass('done');
  });
});
