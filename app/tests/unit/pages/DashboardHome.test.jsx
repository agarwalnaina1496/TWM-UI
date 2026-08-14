import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardHome from '../../../src/pages/DashboardHome.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { SeedAuth } from '../testUtils.js';

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

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty state when the only trip is fresh/empty', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(await screen.findByText('No trips yet')).toBeInTheDocument();
    expect(screen.getByText('Plan a Trip')).toBeInTheDocument();
    expect(screen.getByText('Discover Destination')).toBeInTheDocument();
  });

  it('renders stage-aware badge and CTA for a real trip', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [tripRecord({ title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } } })],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(await screen.findByText(/browsing as a guest/i)).toBeInTheDocument();
    expect(screen.getByText('Coorg')).toBeInTheDocument();
    expect(screen.getByText('Destination chosen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review recommendations/i })).toBeInTheDocument();
  });

  it('shows the View trip CTA for an itinerary-ready trip', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [tripRecord({
        title: 'Manali', trip_state: { stage: 'planned', trip_context: { origin: 'Delhi' }, itinerary_state: { status: 'ready' } },
      })],
    }));
    renderDashboardHome({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    expect(await screen.findByText('Signed in as Traveler')).toBeInTheDocument();
    expect(screen.getByText('Itinerary ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view trip/i })).toBeInTheDocument();
  });

  it.each([
    ['active', 'matching', 'In conversation'],
    ['upcoming', 'planned', 'Itinerary ready'],
    ['completed', 'done', 'Completed'],
  ])('filters to the %s section', async (filterKey, stage, badgeText) => {
    const itinerary = stage === 'planned' ? { itinerary_state: { status: 'ready' } } : {};
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [
        tripRecord({ id: 'trip-1', title: 'Matches filter', trip_state: { stage, trip_context: { origin: 'Delhi' }, ...itinerary } }),
        tripRecord({
          id: 'trip-2', title: 'Recommended trip', trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' } },
          updated_at: '2025-12-01T00:00:00.000Z',
        }),
      ],
    }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Matches filter');

    const label = filterKey[0].toUpperCase() + filterKey.slice(1);
    await userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${label}`) }));

    expect(screen.getByText('Matches filter')).toBeInTheDocument();
    expect(screen.getByText(badgeText)).toBeInTheDocument();
  });

  it('empty-state "Plan a Trip" clears the current trip locally without creating a Backend record yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('No trips yet');

    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByText('Plan a Trip'));

    // No POST — the Backend trip is created lazily by the traveler's first
    // message on the new journey, not by clicking "Plan a Trip" itself.
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
          tripRecord({ id: 'trip-1', title: 'Coorg', trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } }),
          tripRecord({
            id: 'trip-2', title: 'Deleted elsewhere', trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' } },
            updated_at: '2025-12-01T00:00:00.000Z',
          }),
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('Deleted elsewhere');

    await userEvent.click(within(screen.getByText('Deleted elsewhere').closest('.trip-card')).getByRole('button', { name: /review recommendations/i }));

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
    expect(await screen.findByText('Log in to sync across devices')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the account-only history lock for a logged-in traveler', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    await screen.findByText('No trips yet');
    expect(screen.queryByText('Log in to sync across devices')).not.toBeInTheDocument();
  });

  it('opens the contextual sync invitation only after an explicit click, never automatically', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('No trips yet');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Log in to sync across devices'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Log in to sync this trip across devices')).toBeInTheDocument();
  });

  it('choosing Continue without login closes the modal but keeps the invitation visible for next time', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    await screen.findByText('No trips yet');
    await userEvent.click(screen.getByText('Log in to sync across devices'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue without login' }));
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Log in to sync across devices')).toBeInTheDocument();
  });
});
