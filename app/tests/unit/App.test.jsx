import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { TripProvider } from '../../src/context/TripContext.jsx';
import { seedState } from './testUtils.js';

function seedAuth(auth) {
  seedState({ auth });
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

  it('keeps destination discovery in chat and exposes the exact fixture reply sequence', async () => {
    const user = userEvent.setup();
    seedAuth({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    renderApp(['/journey-entry?intent=discover_destination']);

    expect(screen.getByPlaceholderText('Tell Scout about your trip…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Planning a 2-week end-of-year India trip with mild weather' }));
    expect(screen.getByText(/Hey everyone, My spouse and I are planning/)).toBeInTheDocument();
    expect(screen.queryByText(/\*\*Planning a 2-week/)).not.toBeInTheDocument();
    expect(screen.getByText(/Where will you be travelling from\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delhi' }));
    expect(screen.getByText(/what total budget would you like to stay within/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '₹1,00,000 total for both' }));
    expect(screen.getByRole('button', { name: 'See destinations →' })).toBeInTheDocument();
  });

  it('uses the full-height chat shell for advice and known-destination entry', () => {
    seedAuth({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    const advice = renderApp(['/scout-chat?entry=advice']);
    expect(screen.getByText('Scout is here to help with your trip.').closest('.chat-screen')).toBeInTheDocument();
    advice.unmount();

    renderApp(['/journey-entry?intent=known_destination']);
    expect(screen.getByText('Guide is here to help plan your destination.').closest('.chat-screen')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Coorg, Karnataka')).toBeInTheDocument();
  });
});
