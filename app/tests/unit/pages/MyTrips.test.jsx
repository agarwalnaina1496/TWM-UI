import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MyTrips from '../../../src/pages/MyTrips.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { seedState } from '../testUtils.js';

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

function renderMyTrips() {
  return render(
    <MemoryRouter>
      <TripProvider>
        <MyTrips />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('MyTrips (TWM-108)', () => {
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
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord()));
    renderMyTrips();
    expect(await screen.findByText('Nothing saved yet.')).toBeInTheDocument();
    expect(screen.queryByText('+ New trip')).not.toBeInTheDocument();
  });

  it('renders stage-aware badge and CTA for a real trip', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } },
      })));
    renderMyTrips();
    expect(await screen.findByText(/browsing as a guest/i)).toBeInTheDocument();
    expect(screen.getByText('Coorg')).toBeInTheDocument();
    expect(screen.getByText('Destination chosen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review recommendations/i })).toBeInTheDocument();
  });

  it('shows the Dashboard CTA for an itinerary-ready trip', async () => {
    seedState({ auth: { loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        title: 'Manali', trip_state: { stage: 'planned', trip_context: { origin: 'Delhi' }, itinerary_state: { status: 'ready' } },
      })));
    renderMyTrips();
    expect(await screen.findByText('Signed in as Traveler.')).toBeInTheDocument();
    expect(screen.getByText('Itinerary ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open dashboard/i })).toBeInTheDocument();
  });

  it.each([
    ['active', 'matching', 'In conversation'],
    ['upcoming', 'planned', 'Itinerary ready'],
    ['completed', 'done', 'Completed'],
  ])('filters to the %s section', async (filterKey, stage, badgeText) => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    const itinerary = stage === 'planned' ? { itinerary_state: { status: 'ready' } } : {};
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }, { id: 'trip-2' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        id: 'trip-1', title: 'Matches filter', trip_state: { stage, trip_context: { origin: 'Delhi' }, ...itinerary },
      })))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        id: 'trip-2', title: 'Recommended trip', trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' } },
        updated_at: '2025-12-01T00:00:00.000Z',
      })));
    renderMyTrips();
    await screen.findByText('Matches filter');

    const label = filterKey[0].toUpperCase() + filterKey.slice(1);
    await userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${label}`) }));

    expect(screen.getByText('Matches filter')).toBeInTheDocument();
    expect(screen.getByText(badgeText)).toBeInTheDocument();
  });

  it('New Trip creates a real Backend trip and preserves the existing one', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } },
      })))
      .mockResolvedValueOnce(jsonResponse(tripRecord({ id: 'trip-2', title: 'Untitled Trip' }), { status: 201 }));
    renderMyTrips();
    await screen.findByText('Coorg');

    await userEvent.click(screen.getByText('+ New trip'));

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/trips', expect.objectContaining({ method: 'POST' })));
  });

  it('renames a trip through the Backend', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } },
      })))
      .mockResolvedValueOnce(jsonResponse(tripRecord({ title: 'Coorg Weekend', version: 2 })));
    renderMyTrips();
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
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }, { id: 'trip-2' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        id: 'trip-1', title: 'Coorg', trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } },
      })))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        id: 'trip-2', title: 'Deleted elsewhere', trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' } },
        updated_at: '2025-12-01T00:00:00.000Z',
      })))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
    renderMyTrips();
    await screen.findByText('Deleted elsewhere');

    await userEvent.click(within(screen.getByText('Deleted elsewhere').closest('.trip-card')).getByRole('button', { name: /review recommendations/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This trip is no longer available.');
    expect(screen.queryByText('Deleted elsewhere')).not.toBeInTheDocument();
    expect(screen.getByText('Coorg')).toBeInTheDocument();
  });

  it('renaming a trip that returns 404 shows an unavailable notice (TWM-109)', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({
        title: 'Coorg', trip_state: { stage: 'matched', trip_context: { origin: 'Delhi' } },
      })))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
    renderMyTrips();
    await screen.findByText('Coorg');

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByDisplayValue('Coorg');
    await userEvent.clear(input);
    await userEvent.type(input, 'Coorg Weekend{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('This trip is no longer available.');
    expect(screen.queryByText('Coorg')).not.toBeInTheDocument();
  });

  it('shows an explanatory locked section for account-only history instead of redirecting (TWM-140)', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord()));
    renderMyTrips();
    expect(await screen.findByText(/trip history from other devices or a previous account/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the account-only history lock for a logged-in traveler', async () => {
    seedState({ auth: { loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord()));
    renderMyTrips();
    await screen.findByText('Nothing saved yet.');
    expect(screen.queryByText(/trip history from other devices/i)).not.toBeInTheDocument();
  });

  it('opens the contextual sync invitation only after an explicit click, never automatically', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord()));
    renderMyTrips();
    await screen.findByText('Nothing saved yet.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Log in to sync across devices'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Log in to sync this trip across devices')).toBeInTheDocument();
  });

  it('choosing Continue without login on the invitation keeps the traveler on My Trips and stops re-offering the locked-history prompt this session', async () => {
    seedState({ auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord()));
    renderMyTrips();
    await screen.findByText('Nothing saved yet.');
    await userEvent.click(screen.getByText('Log in to sync across devices'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue without login' }));
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
    expect(screen.queryByText('Log in to see synced trip history')).not.toBeInTheDocument();
  });
});
