import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyTrips from '../../../src/pages/MyTrips.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { seedState } from '../testUtils.js';

function renderMyTrips() {
  return render(
    <MemoryRouter>
      <TripProvider>
        <MyTrips />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('MyTrips', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the empty state and a start-a-trip link when nothing is saved', () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' }, savedTrips: [] });
    renderMyTrips();
    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start a trip/i })).toHaveAttribute('href', '/');
    expect(screen.queryByText('+ New trip')).not.toBeInTheDocument();
  });

  it('shows guest copy and renders a saved trip card', () => {
    seedState({
      auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' },
      savedTrips: [{ destination: 'Coorg', days: [{ day: 1 }, { day: 2 }], plan: 'self-led', paid: false }],
    });
    renderMyTrips();
    expect(screen.getByText(/browsing as a guest/i)).toBeInTheDocument();
    expect(screen.getByText('Coorg')).toBeInTheDocument();
    expect(screen.getByText(/2 days.*Self-Led/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute('href', '/trip-preview');
  });

  it('shows signed-in copy and a View link for a paid trip', () => {
    seedState({
      auth: { loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' },
      savedTrips: [{ destination: 'Manali', days: [{ day: 1 }], plan: 'self-led', paid: true }],
    });
    renderMyTrips();
    expect(screen.getByText('Signed in as Traveler.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute('href', '/itinerary');
  });
});
