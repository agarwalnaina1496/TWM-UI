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

// TWM-234: Discover and Plan are two distinct modules -- this label is the
// one constant signal of which one a trip is currently in.
describe('TripHero module label', () => {
  it('says "Discovering a destination" for every Discover stage', () => {
    for (const stage of ['new', 'matching', 'recommended', 'matched']) {
      const { unmount } = render(<TripHero view={view({ lifecycle: { stage } })} />);
      expect(screen.getByText('Discovering a destination')).toBeInTheDocument();
      unmount();
    }
  });

  it('says "Planning your trip" for every Plan stage', () => {
    for (const stage of ['planning', 'plan_ready', 'planned']) {
      const { unmount } = render(<TripHero view={view({ lifecycle: { stage } })} />);
      expect(screen.getByText('Planning your trip')).toBeInTheDocument();
      unmount();
    }
  });
});

// TWM-234: a fresh, pre-match trip has no known facts yet -- the stat row
// should never show placeholder tiles around an empty conversation.
describe('TripHero pre-plan stat row', () => {
  it('shows no stat row at all when nothing is known yet', () => {
    const { container } = render(<TripHero view={view({ lifecycle: { stage: 'matching' } })} />);
    expect(container.querySelector('.hero-stats')).not.toBeInTheDocument();
    expect(screen.queryByText('Not set yet')).not.toBeInTheDocument();
  });

  it('shows only the facts that are actually known, growing as they arrive', () => {
    render(<TripHero view={view({
      lifecycle: { stage: 'matching' },
      context_recap: [
        { key: 'origin_city', label: 'origin_city', value: 'Delhi' },
        { key: 'num_travelers', label: 'num_travelers', value: '2 travelers' },
      ],
    })} />);
    expect(screen.getByText('2 travelers')).toBeInTheDocument();
    expect(screen.getByText('Travelers')).toBeInTheDocument();
    expect(screen.queryByText('Days')).not.toBeInTheDocument();
    expect(screen.queryByText('Travel dates')).not.toBeInTheDocument();
    expect(screen.queryByText('Budget')).not.toBeInTheDocument();
    expect(screen.queryByText('Not set yet')).not.toBeInTheDocument();
  });
});
