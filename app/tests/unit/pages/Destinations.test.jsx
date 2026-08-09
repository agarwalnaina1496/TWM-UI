import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Destinations from '../../../src/pages/Destinations.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { seedState } from '../testUtils.js';

function seedTrip(trip) {
  seedState({ trip, auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
}

function renderDestinations(initialEntries = ['/destinations?next=preview']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripProvider>
        <Destinations />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('Destinations', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a thinking indicator before the fixture match results load', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();
    expect(screen.getByText(/Matching destinations to your answers/)).toBeInTheDocument();
  });

  it('renders fixture match results with a Plan-this-trip action after the match delay', () => {
    seedTrip({ budget: 'budget', style: 'nature', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('Pondicherry')).toBeInTheDocument();
    expect(screen.getAllByText('Plan this trip →').length).toBeGreaterThan(0);
  });

  it('shows a Want-to-plan-this link instead of a button when entered from discover-only', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations(['/destinations?next=none']);

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getAllByText('Want to plan this? →').length).toBeGreaterThan(0);
    expect(screen.queryByText('Plan this trip →')).not.toBeInTheDocument();
  });
});
