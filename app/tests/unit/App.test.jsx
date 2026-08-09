import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { TripProvider } from '../../src/context/TripContext.jsx';

const STORAGE_KEY = 'twm_prototype_state_v1';

function seedAuth(auth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip: {}, auth, savedTrips: [] }));
}

function renderApp(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripProvider>
        <App />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('App RequireAuth guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to /login when there is no access', () => {
    renderApp(['/scout-chat']);
    expect(screen.getByRole('heading', { name: /log in to/i })).toBeInTheDocument();
  });

  it('renders the protected route directly when access already exists', () => {
    seedAuth({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    renderApp(['/']);
    expect(screen.getByRole('heading', { name: /where are we headed/i })).toBeInTheDocument();
  });

  it('lets a logged-in user reach My Trips without a redirect', () => {
    seedAuth({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    renderApp(['/my-trips']);
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
  });
});
