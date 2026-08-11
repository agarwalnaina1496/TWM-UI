import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      savedTrips: [{ destination: { type: 'single', name: 'Coorg', places: null }, days: [{ day: 1 }, { day: 2 }], plan: 'self-led', paid: false }],
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
      savedTrips: [{ destination: { type: 'single', name: 'Manali', places: null }, days: [{ day: 1 }], plan: 'self-led', paid: true }],
    });
    renderMyTrips();
    expect(screen.getByText('Signed in as Traveler.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute('href', '/itinerary');
  });

  it('shows an explanatory locked section for account-only history instead of redirecting (TWM-140)', () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' }, savedTrips: [] });
    renderMyTrips();
    expect(screen.getByText(/trip history from other devices or a previous account/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the account-only history lock for a logged-in traveler', () => {
    seedState({ auth: { loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' }, savedTrips: [] });
    renderMyTrips();
    expect(screen.queryByText(/trip history from other devices/i)).not.toBeInTheDocument();
  });

  it('opens the contextual sync invitation only after an explicit click, never automatically', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' }, savedTrips: [] });
    renderMyTrips();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Log in to sync across devices'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Log in to sync this trip across devices')).toBeInTheDocument();
  });

  it('choosing Continue without login on the invitation keeps the traveler on My Trips and stops re-offering the locked-history prompt this session', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' }, savedTrips: [] });
    renderMyTrips();
    await userEvent.click(screen.getByText('Log in to sync across devices'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue without login' }));
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
    expect(screen.queryByText('Log in to see synced trip history')).not.toBeInTheDocument();
  });
});
