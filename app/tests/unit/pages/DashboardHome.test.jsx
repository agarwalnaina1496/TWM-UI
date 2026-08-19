import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardHome from '../../../src/pages/DashboardHome.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { SeedAuth, mockFetchWithGuestSession } from '../testUtils.js';

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function tripRecord(overrides = {}) {
  return {
    id: 'trip-1', title: 'Untitled Trip', product_mode: 'self_led', version: 1,
    trip_state: {}, ui_state: {}, updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderDashboardHome(auth) {
  return render(
    <MemoryRouter>
      <TripProvider>
        {auth ? <SeedAuth auth={auth}><DashboardHome /></SeedAuth> : <DashboardHome />}
      </TripProvider>
    </MemoryRouter>
  );
}

describe('DashboardHome (TWM-108/163)', () => {
  let fetchMock;

  // TripProvider's own boot check (GET /auth/me) is authoritative and runs
  // after SeedAuth's seed (child effects fire before parent effects) — mock
  // it to agree with the seeded state, or it would overwrite the seed back
  // to guest once it resolves. Most tests here are guest-scoped; the two
  // logged-in tests re-create fetchMock with authenticatedAs before queuing
  // their trips response.
  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty state when the only trip is fresh/empty', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(await screen.findByText('No trips yet')).toBeInTheDocument();
    expect(screen.getByText("Know where you're going?")).toBeInTheDocument();
    expect(screen.getByText('Still deciding?')).toBeInTheDocument();
  });

  // TWM-182: trips starts as [] before the boot fetch resolves — the
  // empty-state check must consult tripLoadStatus, not just trips.length,
  // or a returning traveler with real trips briefly sees "No trips yet".
  it('shows a loading state before the empty state while trips are still being fetched', async () => {
    let resolveTrips;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveTrips = resolve; }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });

    expect(screen.getByText('Loading your trips…')).toBeInTheDocument();
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument();

    resolveTrips(jsonResponse({ trips: [] }));
    expect(await screen.findByText('No trips yet')).toBeInTheDocument();
  });

  it('shows a "+ New trip" menu when trips exist, with both entry actions', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [tripRecord({ title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } })],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Coorg');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('+ New trip'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /plan a trip/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /discover destination/i })).toBeInTheDocument();
  });

  it('does not show the "+ New trip" menu on the empty state (it already offers both actions inline)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('No trips yet');
    expect(screen.queryByText('+ New trip')).not.toBeInTheDocument();
  });

  it('renders stage-aware badge and CTA for a real trip', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [tripRecord({ title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } })],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(await screen.findByText(/browsing as a guest/i)).toBeInTheDocument();
    expect(screen.getByText('Coorg')).toBeInTheDocument();
    expect(screen.getByText('Destination chosen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open trip →' })).toBeInTheDocument();
  });

  it('shows the View trip CTA for an itinerary-ready trip', async () => {
    fetchMock = mockFetchWithGuestSession({ authenticatedAs: { id: 'u1', email: 't@example.com' } });
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [tripRecord({
        title: 'Manali', trip_state: { stage: 'planned', trip_context: { origin: 'Delhi' }, itinerary_state: { status: 'ready' } },
      })],
    }));
    renderDashboardHome({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    expect(await screen.findByText('Signed in as Traveler')).toBeInTheDocument();
    expect(screen.getByText('Itinerary ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open trip →' })).toBeInTheDocument();
  });

  // TWM-172: discover-only sessions (no destination chosen yet — stage
  // matching/recommendation_ready/recommended) never appear in the main
  // committed-trips list, only the lighter "Continue exploring" rail.
  it('keeps discover-only trips out of the main list, in the explore rail instead', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        tripRecord({ id: 'trip-1', title: 'Committed trip', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } }),
        tripRecord({
          id: 'trip-2', title: 'Still browsing', trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' } },
          updated_at: '2025-12-01T00:00:00.000Z',
        }),
      ],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Committed trip');

    expect(screen.getByText('Continue exploring')).toBeInTheDocument();
    const railCard = screen.getByText('Still browsing').closest('.explore-card');
    expect(railCard).toBeInTheDocument();
    expect(within(railCard).getByRole('button', { name: 'Review recommendations' })).toBeInTheDocument();

    const committedCard = screen.getByText('Committed trip').closest('.trip-card');
    expect(committedCard).toBeInTheDocument();
    expect(within(committedCard).getByRole('button', { name: 'Open trip →' })).toBeInTheDocument();
  });

  // TWM-172: hero selection is date-driven off trip_context.month — an
  // ongoing (current-month) trip always outranks an upcoming one.
  it('promotes the ongoing trip to the hero position over an upcoming one', async () => {
    const now = new Date();
    const currentMonthName = now.toLocaleDateString('en-US', { month: 'long' });
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        tripRecord({ id: 'trip-1', title: 'Later trip', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi', month: 'December' } } }),
        tripRecord({ id: 'trip-2', title: 'Happening now', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi', month: currentMonthName } } }),
      ],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Later trip');

    const hero = document.querySelector('.hero-trip');
    expect(hero).toBeInTheDocument();
    expect(within(hero).getByText('Happening now')).toBeInTheDocument();
  });

  it('shows no hero at all when no committed trip has a parseable month', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [tripRecord({ title: 'Vague trip', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } })],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Vague trip');
    expect(document.querySelector('.hero-trip')).not.toBeInTheDocument();
  });

  // TWM-172: completed trips get their own quiet section, separate from the
  // regular committed list.
  it('separates completed trips into their own past-trips section', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        tripRecord({ id: 'trip-1', title: 'Still going', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } }),
        tripRecord({ id: 'trip-2', title: 'All done', trip_state: { stage: 'done', trip_context: { origin: 'Delhi' } } }),
      ],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Still going');

    const pastSection = document.querySelector('.past-trips');
    expect(pastSection).toBeInTheDocument();
    expect(within(pastSection).getByText('All done')).toBeInTheDocument();
    expect(within(pastSection).queryByText('Still going')).not.toBeInTheDocument();
  });

  // Regression: a traveler whose only trips are all completed must not see
  // the "No trips here yet" empty-list fallback directly above their real
  // past-trips section — the fallback must also check completedTrips.
  it('does not show the empty-list fallback when the only trips are completed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [tripRecord({ title: 'Old trip', trip_state: { stage: 'done', trip_context: { origin: 'Delhi' } } })],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Old trip');

    expect(screen.queryByText('No trips here yet.')).not.toBeInTheDocument();
    expect(document.querySelector('.past-trips')).toBeInTheDocument();
  });

  // TWM-172: search is a client-side filter over the traveler's own trips
  // only — never a destination lookup (no extra fetch is issued).
  it('search filters to matching trips only, without issuing any lookup request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        tripRecord({ id: 'trip-1', title: 'Coorg weekend', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } }),
        tripRecord({ id: 'trip-2', title: 'Manali trip', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } }),
      ],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Coorg weekend');

    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.type(screen.getByLabelText('Search your trips'), 'coorg');

    expect(screen.getByText('Coorg weekend')).toBeInTheDocument();
    expect(screen.queryByText('Manali trip')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('empty-state "Know where you\'re going?" clears the current trip locally without creating a Backend record yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('No trips yet');

    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByText("Know where you're going?"));

    // No POST — the Backend trip is created lazily by the traveler's first
    // message on the new journey, not by clicking the entry door itself.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('renames a trip through the Backend', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [tripRecord({ title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } })],
      }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({ title: 'Coorg Weekend', version: 2 })));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Coorg');

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByDisplayValue('Coorg');
    await userEvent.clear(input);
    await userEvent.type(input, 'Coorg Weekend{Enter}');

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Coorg Weekend' }),
    })));
  });

  it('opening a trip that returns 404 shows an unavailable notice and drops the card (TWM-109)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [
          tripRecord({ id: 'trip-1', title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } }),
          tripRecord({
            id: 'trip-2', title: 'Deleted elsewhere', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } },
            updated_at: '2025-12-01T00:00:00.000Z',
          }),
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Deleted elsewhere');

    await userEvent.click(within(screen.getByText('Deleted elsewhere').closest('.trip-card')).getByRole('button', { name: 'Open trip →' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This trip is no longer available.');
    expect(screen.queryByText('Deleted elsewhere')).not.toBeInTheDocument();
    expect(screen.getByText('Coorg')).toBeInTheDocument();
  });

  it('renaming a trip that returns 404 shows an unavailable notice (TWM-109)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        trips: [tripRecord({ title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } })],
      }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Coorg');

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByDisplayValue('Coorg');
    await userEvent.clear(input);
    await userEvent.type(input, 'Coorg Weekend{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('This trip is no longer available.');
    expect(screen.queryByText('Coorg')).not.toBeInTheDocument();
  });

  it('shows an explanatory locked section for account-only history instead of redirecting (TWM-140)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(await screen.findByText("Log in so you don't lose this")).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the account-only history lock for a logged-in traveler', async () => {
    fetchMock = mockFetchWithGuestSession({ authenticatedAs: { id: 'u1', email: 't@example.com' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    await screen.findByText('No trips yet');
    expect(screen.queryByText("Log in so you don't lose this")).not.toBeInTheDocument();
  });

  it('opens the contextual sync invitation only after an explicit click, never automatically', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('No trips yet');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Log in so you don't lose this"));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText("Log in so you don't lose this trip")).toBeInTheDocument();
  });

  it('choosing Continue without login closes the modal but keeps the invitation visible for next time', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('No trips yet');
    await userEvent.click(screen.getByText("Log in so you don't lose this"));
    await userEvent.click(screen.getByRole('button', { name: 'Continue without login' }));
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText("Log in so you don't lose this")).toBeInTheDocument();
  });
});
