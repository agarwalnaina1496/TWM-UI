import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import Header from '../../../src/components/Header.jsx';
import LoginModal from '../../../src/components/LoginModal.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { SeedAuth, mockFetchWithGuestSession } from '../testUtils.js';

function renderHeader(auth) {
  // TripProvider's own boot check (GET /auth/me) is authoritative and runs
  // after SeedAuth's seed (child effects fire before parent effects) — mock
  // it to agree with the seeded state, or it would overwrite the seed back
  // to guest once it resolves.
  mockFetchWithGuestSession({ authenticatedAs: auth?.loggedIn ? { id: 'u1', email: auth.email } : null });
  return render(
    <MemoryRouter>
      <TripProvider>
        {auth ? <SeedAuth auth={auth}><Header /></SeedAuth> : <Header />}
      </TripProvider>
    </MemoryRouter>
  );
}

function renderHeaderWithLoginModal(initialEntries) {
  mockFetchWithGuestSession();
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripProvider>
        <Header />
        <LoginModal />
      </TripProvider>
    </MemoryRouter>
  );
}

function renderHeaderWithJourneyRoute() {
  mockFetchWithGuestSession();
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TripProvider>
        <Header />
        <Routes>
          <Route path="/" element={<div>Dashboard-home screen</div>} />
          <Route path="/journey-entry" element={<JourneyEntryProbe />} />
        </Routes>
      </TripProvider>
    </MemoryRouter>
  );
}

function JourneyEntryProbe() {
  const [params] = useSearchParams();
  return <div>Journey entry screen (intent={params.get('intent')})</div>;
}

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  it('shows the brand link (home) and an explicit Log in for a fresh anonymous visitor', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: /travelwithme/i })).toHaveAttribute('href', '/');
    expect(screen.getByText(/log in/i)).toBeInTheDocument();
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
  });

  it('shows Log in (no Log out) for an explicit anonymous/guest session', () => {
    renderHeader({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(screen.getByText(/log in/i)).toBeInTheDocument();
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
  });

  it('shows Log out (no Log in) for a real logged-in session', () => {
    renderHeader({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    expect(screen.getByText(/log out/i)).toBeInTheDocument();
    expect(screen.queryByText(/log in/i)).not.toBeInTheDocument();
  });

  it('explicit Header Log in opens the login overlay directly, since it is deliberate traveler intent', async () => {
    renderHeaderWithLoginModal(['/my-trips']);
    await userEvent.click(screen.getByText(/log in/i));
    expect(screen.getByRole('heading', { name: /log in to continue/i })).toBeInTheDocument();
  });

  it('shows Plan a Trip and Discover Destination nav items', () => {
    renderHeader();
    expect(screen.getByText('Plan a Trip')).toBeInTheDocument();
    expect(screen.getByText('Discover Destination')).toBeInTheDocument();
  });

  it('"Plan a Trip" routes to journey-entry with the known_destination intent', async () => {
    renderHeaderWithJourneyRoute();
    await userEvent.click(screen.getByText('Plan a Trip'));
    expect(screen.getByText('Journey entry screen (intent=known_destination)')).toBeInTheDocument();
  });

  it('"Discover Destination" routes to journey-entry with the discover intent', async () => {
    renderHeaderWithJourneyRoute();
    await userEvent.click(screen.getByText('Discover Destination'));
    expect(screen.getByText('Journey entry screen (intent=discover_destination)')).toBeInTheDocument();
  });
});
