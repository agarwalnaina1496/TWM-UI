import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../../src/components/Header.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { seedState } from '../testUtils.js';

function seedAuth(auth) {
  seedState({ auth });
}

function renderHeader() {
  return render(
    <MemoryRouter>
      <TripProvider>
        <Header />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows a plain anchor brand link and no nav when there is no access', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: /travelwithme/i })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/my trips/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
  });

  it('shows My Trips but no Log out for an anonymous/guest session', () => {
    seedAuth({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    renderHeader();
    expect(screen.getByText(/my trips/i)).toBeInTheDocument();
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
  });

  it('shows both My Trips and Log out for a real logged-in session', () => {
    seedAuth({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    renderHeader();
    expect(screen.getByText(/my trips/i)).toBeInTheDocument();
    expect(screen.getByText(/log out/i)).toBeInTheDocument();
  });
});
