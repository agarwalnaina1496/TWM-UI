import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TripHero from '../../../src/components/TripHero.jsx';

function view(overrides = {}) {
  return { id: 't1', title: null, context_recap: [], ...overrides };
}

// TWM-234: the pre-plan "still working this out" fallback stays
// stage-accurate about what's happening (matching vs. planning) without
// ever naming Meridian or Guide -- Scout is the only agent name shown to
// the traveler.
describe('TripHero pre-plan fallback copy', () => {
  it('reflects a matching-owned stage without naming Meridian', () => {
    render(<TripHero view={view({ lifecycle: { stage: 'matching' } })} />);
    expect(screen.getAllByText('Scout is still narrowing down the best match.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Meridian/)).not.toBeInTheDocument();
  });

  it('reflects a planning-owned stage without naming Guide', () => {
    render(<TripHero view={view({ lifecycle: { stage: 'planning' } })} />);
    expect(screen.getAllByText('Scout is still working out your plan.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Guide/)).not.toBeInTheDocument();
  });
});
