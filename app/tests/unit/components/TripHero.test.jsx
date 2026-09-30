import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TripHero from '../../../src/components/TripHero.jsx';

function view(overrides = {}) {
  return { id: 't1', title: null, context_recap: [], ...overrides };
}

// TWM-234: the pre-plan "still working this out" fallback previously always
// attributed the pending work to Guide, even on a Meridian-owned stage
// (matching/recommended/matched) where Guide hasn't started yet.
describe('TripHero pre-plan fallback copy', () => {
  it('attributes a Meridian-owned stage to Meridian, not Guide', () => {
    render(<TripHero view={view({ lifecycle: { stage: 'matching' } })} />);
    expect(screen.getAllByText('Meridian is still working out the best match.').length).toBeGreaterThan(0);
    expect(screen.queryByText('Guide is still working this out.')).not.toBeInTheDocument();
  });

  it('attributes a Guide-owned stage to Guide', () => {
    render(<TripHero view={view({ lifecycle: { stage: 'planning' } })} />);
    expect(screen.getAllByText('Guide is still working this out.').length).toBeGreaterThan(0);
  });
});
