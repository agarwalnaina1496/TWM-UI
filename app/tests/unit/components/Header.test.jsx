import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import Header from '../../../src/components/Header.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { SeedAuth } from '../testUtils.js';

function renderHeader(auth) {
  return render(
    <MemoryRouter>
      <TripProvider>
        {auth ? <SeedAuth auth={auth}><Header /></SeedAuth> : <Header />}
      </TripProvider>
    </MemoryRouter>
  );
}

function renderHeaderWithLoginRoute(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripProvider>
        <Header />
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route path="/my-trips" element={<div>My trips screen</div>} />
        </Routes>
      </TripProvider>
    </MemoryRouter>
  );
}

function renderHeaderWithJourneyRoute() {
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

  it('explicit Header Log in opens Login directly, since it is deliberate traveler intent', async () => {
    renderHeaderWithLoginRoute(['/my-trips']);
    await userEvent.click(screen.getByText(/log in/i));
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('shows Home, Plan a Trip, and Discover Destination nav items', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
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
