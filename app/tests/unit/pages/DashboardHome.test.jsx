import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
    id, title, title_source: title === 'Untitled Trip' ? 'placeholder' : 'user', product_mode: 'self_led', version: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    lifecycle: { stage, status: 'free', active_agent: null, selected_option: null },
    context_recap: recap(context), travel_window: travelWindow,
    has_places: false, has_day_plan: false, has_itinerary: false, awaiting: null, has_recommendation: false,
    ...rest,
  };
}
function tripView(overrides = {}) {
  const {
    id = 'trip-1', title = 'Untitled Trip', version = 2, title_source = 'user',
    lifecycle = { stage: 'matched', status: 'free', active_agent: null, selected_option: null },
    context_recap = [],
  } = overrides;
  return jsonResponse({
    id, title, title_source, product_mode: 'self_led', version, ui_state: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    lifecycle, context_recap, plan: null, matcher: { last_message: null, awaiting: null, has_recommendation: false },
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({ title: 'Coorg', stage: 'planning', context: { origin_city: 'Delhi' } })] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Coorg');
    await userEvent.click(screen.getByText('+ New trip'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /plan a trip/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /discover destination/i })).toBeInTheDocument();
  });

  it('shows a status line and a relative "updated" timestamp on a trip card', async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({
      title: 'Coorg Getaway', stage: 'planning', context: { destinations: 'Coorg' }, has_places: true, updated_at: fourHoursAgo,
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

  it('splits Discovering (no plan started) from actual trips, each with its own CTA', async () => {
    // TWM-234: a destination matched but not yet planned, or still being
    // recommended, isn't "a trip" to the traveler yet -- it gets its own
    // "Discovering" section and "Continue exploring" CTA, separate from
    // "Your trips"/"Open trip" for anything already past matched.
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Committed trip', stage: 'planning', context: { origin_city: 'Delhi' } }),
      listItem({ id: 'trip-2', title: 'Untitled Trip', stage: 'recommended', context: { origin_city: 'Delhi' }, updated_at: '2025-12-01T00:00:00.000Z' }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Committed trip');
    expect(screen.getByText('Discovering')).toBeInTheDocument();
    expect(screen.getByText('Your trips')).toBeInTheDocument();
    expect(screen.getByText('Recommendations ready')).toBeInTheDocument();
    const committedCard = screen.getByText('Committed trip').closest('.trip-card');
    expect(within(committedCard).getByRole('button', { name: 'Open trip →' })).toBeInTheDocument();
    const discoveringCard = screen.getByText('Recommendations ready').closest('.trip-card');
    expect(within(discoveringCard).getByRole('button', { name: 'Continue exploring →' })).toBeInTheDocument();
  });

  it('renders whatever title the Backend sends, including the placeholder', async () => {
    // TWM-232: title composition (real title, LLM-generated, or the
    // placeholder) is entirely Backend-owned now -- the UI has no
    // client-side fallback chain and just renders t.title verbatim. Uses a
    // committed (non-discover-only) stage since explore cards show no title.
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: '5 days from Bangalore', stage: 'planning', context: { origin_city: 'Bangalore', destinations: ['Goa'] } }),
    ] }));
    renderDashboardHome(GUEST);
    expect(await screen.findByText('5 days from Bangalore')).toBeInTheDocument();
  });

  it('shows no title/Rename for a trip whose title is still the placeholder, honest badge otherwise', async () => {
    // TWM-232: uniform card -- badge always shows the real, honest
    // stage-specific text (no more generic label); title/Rename only
    // render once a real title exists.
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Untitled Trip', stage: 'recommended', context: { origin_city: 'Delhi' } }),
    ] }));
    renderDashboardHome(GUEST);
    const card = (await screen.findByRole('button', { name: 'Continue exploring →' })).closest('.trip-card');
    expect(within(card).getByText('Recommendations ready')).toBeInTheDocument();
    expect(within(card).queryByText('Untitled Trip')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  it('caps the recap chips at 2, with a "+N more" chip for the rest', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({
        id: 'trip-1', title: 'Untitled Trip', stage: 'recommended',
        context: { origin_city: 'Delhi', num_travelers: '1', budget: '1 lakh INR' },
      }),
    ] }));
    renderDashboardHome(GUEST);
    const card = (await screen.findByRole('button', { name: 'Continue exploring →' })).closest('.trip-card');
    const pills = within(card).getAllByText(/./, { selector: '.trip-card-recap-pill' });
    expect(pills).toHaveLength(3); // 2 shown facts + 1 "+N more" chip
    expect(within(card).getByText('+1 more')).toBeInTheDocument();
  });

  it('promotes the ongoing trip to the hero over an upcoming one, off travel_window', async () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Later trip', stage: 'planning', context: { origin_city: 'Delhi', destinations: 'Goa' }, travelWindow: { precision: 'month', month: '2026-12' } }),
      listItem({ id: 'trip-2', title: 'Ongoing trip', stage: 'planning', context: { origin_city: 'Delhi', destinations: 'Udaipur' }, travelWindow: { precision: 'month', month: thisMonth } }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Later trip');
    const hero = document.querySelector('.hero-trip');
    expect(within(hero).getByText('Ongoing trip')).toBeInTheDocument();
  });

  it('never promotes a still-deciding trip (no destination) to the hero, even with an ongoing travel_window', async () => {
    // A stated travel window ("traveling in December") can exist before a
    // destination is chosen -- that alone shouldn't earn the prominent hero
    // slot, which is for a real trip to spotlight, not any dated trip.
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Untitled Trip', stage: 'matching', context: { origin_city: 'Delhi' }, travelWindow: { precision: 'month', month: thisMonth } }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('In conversation');
    expect(document.querySelector('.hero-trip')).not.toBeInTheDocument();
  });

  it('shows no hero when no committed trip has a travel_window', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [listItem({ title: 'Vague trip', stage: 'planning', context: { origin_city: 'Delhi' } })] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Vague trip');
    expect(document.querySelector('.hero-trip')).not.toBeInTheDocument();
  });

  it('separates completed trips into their own past-trips section', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Still going', stage: 'planning', context: { origin_city: 'Delhi' } }),
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
      listItem({ id: 'trip-1', title: 'Coorg weekend', stage: 'planning', context: { origin_city: 'Delhi' } }),
      listItem({ id: 'trip-2', title: 'Manali trip', stage: 'planning', context: { origin_city: 'Delhi' } }),
    ] });
    renderDashboardHome(GUEST);
    await screen.findByText('Coorg weekend');
    await userEvent.type(screen.getByLabelText('Search your trips'), 'coorg');
    expect(screen.getByText('Coorg weekend')).toBeInTheDocument();
    expect(screen.queryByText('Manali trip')).not.toBeInTheDocument();
    // No search/lookup endpoint — every call is the list or a trip read.
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/trips' || /^\/api\/trips\/[^/]+$/.test(url))).toBe(true);
  });

  it('searches a trip by its Backend-provided title', async () => {
    // TWM-232: title composition (real, LLM-generated, or placeholder) is
    // entirely Backend-owned -- search just matches whatever t.title is.
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: '5 days from Delhi', stage: 'planning', context: { origin_city: 'Delhi', trip_duration: '5' } }),
      listItem({ id: 'trip-2', title: 'Manali trip', stage: 'planning', context: { origin_city: 'Delhi' } }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('5 days from Delhi');
    await userEvent.type(screen.getByLabelText('Search your trips'), '5 days from');
    expect(screen.getByText('5 days from Delhi')).toBeInTheDocument();
    expect(screen.queryByText('Manali trip')).not.toBeInTheDocument();
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
      trips: [listItem({ title: 'Coorg', stage: 'planning', context: { origin_city: 'Delhi' } })],
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
        listItem({ id: 'trip-1', title: 'Coorg', stage: 'planning', context: { origin_city: 'Delhi' } }),
        listItem({ id: 'trip-2', title: 'Deleted elsewhere', stage: 'planning', context: { origin_city: 'Delhi' }, updated_at: '2025-12-01T00:00:00.000Z' }),
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
      trips: [listItem({ title: 'Coorg', stage: 'planning', context: { origin_city: 'Delhi' } })],
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

  // TWM-234: a matched trip's card is about the chosen destination, with two
  // ways forward. Destination and the traveler's own title coexist.
  describe('matched trip card', () => {
    function commandResponse() {
      return jsonResponse({ message: 'ok', agent_meta: null, recommendation: null, trip: { id: 'trip-1', version: 3 } });
    }
    function routeMatched({ trip, commandStatus = 200, commandBody = commandResponse(), patch }) {
      const commands = [];
      fetchMock.mockImplementation((url, options) => {
        if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [trip] }));
        if (/\/commands$/.test(url)) {
          commands.push(JSON.parse(options.body));
          return Promise.resolve(commandStatus === 200 ? commandBody : jsonResponse(commandBody, { status: commandStatus }));
        }
        if (/^\/api\/trips\/[^/]+$/.test(url) && options?.method === 'PATCH') return Promise.resolve(patch ? patch() : tripView());
        if (/^\/api\/trips\/[^/]+/.test(url)) {
          return Promise.resolve(tripView({
            id: trip.id, title: trip.title, title_source: trip.title_source,
            lifecycle: trip.lifecycle, context_recap: trip.context_recap,
          }));
        }
        return Promise.resolve(jsonResponse({}));
      });
      return commands;
    }
    function renderWithDashboardRoute() {
      return render(
        <MemoryRouter>
          <AppProviders>
            <Routes>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/dashboard" element={<div>OPENED DASHBOARD</div>} />
            </Routes>
          </AppProviders>
        </MemoryRouter>
      );
    }
    const DESTINATION = 'Darjeeling and Gangtok Circuit';
    const matchedTrip = (overrides = {}) => listItem({
      id: 'trip-1', stage: 'matched', context: { origin_city: 'Delhi', destinations: DESTINATION, num_travelers: '4' }, ...overrides,
    });

    it("shows the traveler's own title with Rename, and the destination as its own line", async () => {
      routeMatched({ trip: matchedTrip({ title: 'Puja holidays' }) });
      renderWithDashboardRoute();
      const card = (await screen.findByText('Puja holidays')).closest('.trip-card');
      expect(within(card).getByText(DESTINATION)).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Rename' })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Plan this trip →' })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Want a different destination?' })).toBeInTheDocument();
      expect(within(card).queryByText('Destination chosen')).not.toBeInTheDocument();
    });

    it("never shows an agent-generated title, only the destination plus 'Add a name'", async () => {
      routeMatched({ trip: matchedTrip({ title: '5 Day Getaway from Delhi', title_source: 'generated' }) });
      renderWithDashboardRoute();
      expect(await screen.findByText(DESTINATION)).toBeInTheDocument();
      expect(screen.queryByText('5 Day Getaway from Delhi')).not.toBeInTheDocument();
      expect(screen.getByText('Unnamed trip')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add a name' })).toBeInTheDocument();
    });

    it("'Add a name' starts from a blank input and saves it as the traveler's title", async () => {
      routeMatched({
        trip: matchedTrip({ title: '5 Day Getaway from Delhi', title_source: 'generated' }),
        patch: () => tripView({ title: 'Family trip', version: 2 }),
      });
      renderWithDashboardRoute();
      await userEvent.click(await screen.findByRole('button', { name: 'Add a name' }));
      const input = await screen.findByRole('textbox');
      expect(input).toHaveValue('');
      await userEvent.type(input, 'Family trip{Enter}');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ expected_version: 1, title: 'Family trip' }),
      })));
    });

    it("'Plan this trip' starts planning from the card, then opens the Dashboard", async () => {
      const commands = routeMatched({ trip: matchedTrip({ title: 'Puja holidays' }) });
      renderWithDashboardRoute();
      await userEvent.click(await screen.findByRole('button', { name: 'Plan this trip →' }));
      expect(await screen.findByText('OPENED DASHBOARD')).toBeInTheDocument();
      expect(commands.map(c => c.command)).toEqual(['start_planning']);
    });

    it("'Want a different destination?' reopens the recommendations, then opens the Dashboard", async () => {
      const commands = routeMatched({ trip: matchedTrip({ title: 'Puja holidays' }) });
      renderWithDashboardRoute();
      await userEvent.click(await screen.findByRole('button', { name: 'Want a different destination?' }));
      expect(await screen.findByText('OPENED DASHBOARD')).toBeInTheDocument();
      expect(commands.map(c => c.command)).toEqual(['unselect_destination']);
    });

    it('a rejected command (stale card, another tab got there first) shows an error and stays put', async () => {
      routeMatched({
        trip: matchedTrip({ title: 'Puja holidays' }),
        commandStatus: 422,
        commandBody: { detail: 'Planning can only be started from the new or matched stage.' },
      });
      renderWithDashboardRoute();
      await userEvent.click(await screen.findByRole('button', { name: 'Plan this trip →' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText('OPENED DASHBOARD')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Plan this trip →' })).toBeEnabled();
    });
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
