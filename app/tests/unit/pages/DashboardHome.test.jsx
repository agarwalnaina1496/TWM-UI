import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardHome from '../../../src/pages/DashboardHome.jsx';
import { AppProviders, SeedAuth, mockFetchWithGuestSession } from '../testUtils.js';

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// TWM-220: GET /trips returns TripListItem rows.
function recap(entries) {
  return Object.entries(entries).map(([key, value]) => ({ key, label: labelFor(key), value }));
}
function labelFor(key) {
  return { origin_city: 'Coming from', destinations: 'Destination', budget: 'Budget', num_travelers: 'Travellers' }[key] || key;
}
function listItem(overrides = {}) {
  const { id = 'trip-1', title = 'Untitled Trip', stage = 'new', context = {}, travelWindow = null, ...rest } = overrides;
  return {
    id, title, product_mode: 'self_led', version: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    lifecycle: { stage, status: 'free', active_agent: null, selected_option: null },
    context_recap: recap(context), travel_window: travelWindow,
    has_places: false, has_day_plan: false, has_itinerary: false, awaiting: null, has_recommendation: false,
    ...rest,
  };
}
function tripView(overrides = {}) {
  const { id = 'trip-1', title = 'Untitled Trip', version = 2 } = overrides;
  return jsonResponse({
    id, title, product_mode: 'self_led', version, ui_state: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    lifecycle: { stage: 'matched', status: 'free', active_agent: null, selected_option: null },
    context_recap: [], plan: null, matcher: { last_message: null, awaiting: null, has_recommendation: false },
    summary: null, booking: null, budget_breakdown: null, open_gaps: null, before_you_go: null,
  });
}

function renderDashboardHome(auth) {
  return render(
    <MemoryRouter>
      <AppProviders>
        {auth ? <SeedAuth auth={auth}><DashboardHome /></SeedAuth> : <DashboardHome />}
      </AppProviders>
    </MemoryRouter>
  );
}

const GUEST = { loggedIn: false, isGuest: true, name: 'Guest', email: '' };

describe('DashboardHome', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TWM-221: TripProvider warms ['trip', <most-recent>] on boot, so a plain
  // positional mockResolvedValueOnce queue no longer lines up. Route by URL:
  // `trips` for GET /api/trips, `patch` for PATCH /api/trips/:id, and a
  // default TripView for the background per-trip GET.
  function routeFetch({ trips = [], patch = () => tripView() }) {
    fetchMock.mockImplementation((url, options) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips }));
      if (/^\/api\/trips\/[^/]+$/.test(url) && options?.method === 'PATCH') return Promise.resolve(patch());
      if (/^\/api\/trips\/[^/]+/.test(url)) return Promise.resolve(tripView());
      return Promise.resolve(jsonResponse({}));
    });
  }

  it('shows the empty state when there are no trips', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome(GUEST);
    expect(await screen.findByText('No trips yet')).toBeInTheDocument();
    expect(screen.getByText("Know where you're going?")).toBeInTheDocument();
    expect(screen.getByText('Still deciding?')).toBeInTheDocument();
  });

  it('shows a loading state before the empty state', async () => {
    let resolveTrips;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveTrips = resolve; }));
    renderDashboardHome(GUEST);
    expect(screen.getByText('Loading your trips…')).toBeInTheDocument();
    resolveTrips(jsonResponse({ trips: [] }));
    expect(await screen.findByText('No trips yet')).toBeInTheDocument();
  });

  it('shows a "+ New trip" menu when trips exist', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({ title: 'Coorg', stage: 'matched', context: { origin_city: 'Delhi' } })] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Coorg');
    await userEvent.click(screen.getByText('+ New trip'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /plan a trip/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /discover destination/i })).toBeInTheDocument();
  });

  it('renders stage-aware badge and CTA for a real trip', async () => {
    routeFetch({ trips: [listItem({ title: 'Coorg', stage: 'matched', context: { origin_city: 'Delhi' } })] });
    renderDashboardHome(GUEST);
    await waitFor(() => expect(screen.getByText('Destination chosen')).toBeInTheDocument());
    expect(screen.getByText('Coorg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open trip →' })).toBeInTheDocument();
  });

  it('shows a status line and a relative "updated" timestamp on a trip card', async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({
      title: 'Coorg Getaway', stage: 'matched', context: { destinations: 'Coorg' }, has_places: true, updated_at: fourHoursAgo,
    })] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Coorg Getaway');
    expect(screen.getByText('Coorg', { selector: '.trip-card-destination' })).toBeInTheDocument();
    expect(screen.getByText('Places picked — building the day-by-day plan.')).toBeInTheDocument();
    expect(screen.getByText('updated 4h ago')).toBeInTheDocument();
  });

  it('shows the itinerary-ready badge when has_itinerary is true', async () => {
    fetchMock = mockFetchWithGuestSession({ authenticatedAs: { id: 'u1', email: 't@example.com' } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({
      title: 'Manali', stage: 'planned', context: { origin_city: 'Delhi' }, has_itinerary: true,
    })] }));
    renderDashboardHome({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    expect(await screen.findByText('Signed in as Traveler')).toBeInTheDocument();
    expect(screen.getByText('Itinerary ready')).toBeInTheDocument();
  });

  it('keeps discover-only trips out of the main list, in the explore rail', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Committed trip', stage: 'matched', context: { origin_city: 'Delhi' } }),
      listItem({ id: 'trip-2', title: 'Still browsing', stage: 'recommended', context: { origin_city: 'Delhi' }, updated_at: '2025-12-01T00:00:00.000Z' }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Committed trip');
    expect(screen.getByText('Continue exploring')).toBeInTheDocument();
    const railCard = screen.getByText('Still browsing').closest('.explore-card');
    expect(within(railCard).getByRole('button', { name: 'Review recommendations' })).toBeInTheDocument();
    const committedCard = screen.getByText('Committed trip').closest('.trip-card');
    expect(within(committedCard).getByRole('button', { name: 'Open trip →' })).toBeInTheDocument();
  });

  it('promotes the ongoing trip to the hero over an upcoming one, off travel_window', async () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Later trip', stage: 'matched', context: { origin_city: 'Delhi' }, travelWindow: { precision: 'month', month: '2026-12' } }),
      listItem({ id: 'trip-2', title: 'Happening now', stage: 'matched', context: { origin_city: 'Delhi' }, travelWindow: { precision: 'month', month: thisMonth } }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Later trip');
    const hero = document.querySelector('.hero-trip');
    expect(within(hero).getByText('Happening now')).toBeInTheDocument();
  });

  it('shows no hero when no committed trip has a travel_window', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({ title: 'Vague trip', stage: 'matched', context: { origin_city: 'Delhi' } })] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Vague trip');
    expect(document.querySelector('.hero-trip')).not.toBeInTheDocument();
  });

  it('separates completed trips into their own past-trips section', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Still going', stage: 'matched', context: { origin_city: 'Delhi' } }),
      listItem({ id: 'trip-2', title: 'All done', stage: 'done', context: { origin_city: 'Delhi' } }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Still going');
    const pastSection = document.querySelector('.past-trips');
    expect(within(pastSection).getByText('All done')).toBeInTheDocument();
    expect(within(pastSection).queryByText('Still going')).not.toBeInTheDocument();
  });

  it('does not show the empty-list fallback when the only trips are completed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({ title: 'Old trip', stage: 'done', context: { origin_city: 'Delhi' } })] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Old trip');
    expect(screen.queryByText('No trips here yet.')).not.toBeInTheDocument();
    expect(document.querySelector('.past-trips')).toBeInTheDocument();
  });

  it('search filters to matching trips only, without any lookup request', async () => {
    routeFetch({ trips: [
      listItem({ id: 'trip-1', title: 'Coorg weekend', stage: 'matched', context: { origin_city: 'Delhi' } }),
      listItem({ id: 'trip-2', title: 'Manali trip', stage: 'matched', context: { origin_city: 'Delhi' } }),
    ] });
    renderDashboardHome(GUEST);
    await screen.findByText('Coorg weekend');
    await userEvent.type(screen.getByLabelText('Search your trips'), 'coorg');
    expect(screen.getByText('Coorg weekend')).toBeInTheDocument();
    expect(screen.queryByText('Manali trip')).not.toBeInTheDocument();
    // No search/lookup endpoint — every call is the list or a trip read.
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/trips' || /^\/api\/trips\/[^/]+$/.test(url))).toBe(true);
  });

  it('empty-state entry door creates no Backend record', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome(GUEST);
    await screen.findByText('No trips yet');
    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByText("Know where you're going?"));
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('renames a trip through the Backend', async () => {
    routeFetch({
      trips: [listItem({ title: 'Coorg', stage: 'matched', context: { origin_city: 'Delhi' } })],
      patch: () => tripView({ title: 'Coorg Weekend', version: 2 }),
    });
    renderDashboardHome(GUEST);
    await screen.findByText('Coorg');
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = await screen.findByDisplayValue('Coorg');
    await userEvent.clear(input);
    await userEvent.type(input, 'Coorg Weekend{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/trip-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expected_version: 1, title: 'Coorg Weekend' }),
    })));
  });

  it('opening a trip deleted elsewhere drops it from the shared cache (TWM-109)', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [
        listItem({ id: 'trip-1', title: 'Coorg', stage: 'matched', context: { origin_city: 'Delhi' } }),
        listItem({ id: 'trip-2', title: 'Deleted elsewhere', stage: 'matched', context: { origin_city: 'Delhi' }, updated_at: '2025-12-01T00:00:00.000Z' }),
      ] }));
      if (url === '/api/trips/trip-2') return Promise.resolve(jsonResponse({ detail: 'Trip not found.' }, { status: 404 }));
      if (/^\/api\/trips\/[^/]+/.test(url)) return Promise.resolve(tripView());
      return Promise.resolve(jsonResponse({}));
    });
    renderDashboardHome(GUEST);
    await screen.findByText('Deleted elsewhere');
    await userEvent.click(within(screen.getByText('Deleted elsewhere').closest('.trip-card')).getByRole('button', { name: 'Open trip →' }));
    await waitFor(() => expect(screen.queryByText('Deleted elsewhere')).not.toBeInTheDocument());
    expect(screen.getByText('Coorg')).toBeInTheDocument();
  });

  it('renaming a trip that returns 404 shows an unavailable notice (TWM-109)', async () => {
    routeFetch({
      trips: [listItem({ title: 'Coorg', stage: 'matched', context: { origin_city: 'Delhi' } })],
      patch: () => jsonResponse({ detail: 'Trip not found.' }, { status: 404 }),
    });
    renderDashboardHome(GUEST);
    await screen.findByText('Coorg');
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = await screen.findByDisplayValue('Coorg');
    await userEvent.clear(input);
    await userEvent.type(input, 'Coorg Weekend{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('This trip is no longer available.');
    expect(screen.queryByText('Coorg')).not.toBeInTheDocument();
  });

  it('shows the guest sync invitation, not a redirect', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome(GUEST);
    expect(await screen.findByText("Log in so you don't lose this")).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the guest lock for a logged-in traveler', async () => {
    fetchMock = mockFetchWithGuestSession({ authenticatedAs: { id: 'u1', email: 't@example.com' } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    await screen.findByText('No trips yet');
    expect(screen.queryByText("Log in so you don't lose this")).not.toBeInTheDocument();
  });

  it('opens the contextual sync invitation only after an explicit click', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome(GUEST);
    await screen.findByText('No trips yet');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Log in so you don't lose this"));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText("Log in so you don't lose this trip")).toBeInTheDocument();
  });

  it('Continue without login closes the modal but keeps the invitation visible', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderDashboardHome(GUEST);
    await screen.findByText('No trips yet');
    await userEvent.click(screen.getByText("Log in so you don't lose this"));
    await userEvent.click(screen.getByRole('button', { name: 'Continue without login' }));
    expect(screen.getByText('No trips yet')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText("Log in so you don't lose this")).toBeInTheDocument();
  });
});
