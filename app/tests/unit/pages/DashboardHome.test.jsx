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

  // TWM-234: the Plan module. A trip being planned shares the Discovering
  // card's anatomy; a finished trip is its own sage card with a facts line.
  describe('Plan cards', () => {
    const thisMonth = () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    };
    async function renderTrips(trips) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ trips }));
      renderDashboardHome(GUEST);
      await screen.findByText('Your trips', { selector: 'h2' });
    }

    it('a trip being planned: stored title, destination plus state, chips, Continue planning', async () => {
      await renderTrips([listItem({ id: 'trip-1', title: 'Weekend in Coorg', stage: 'planning', context: { destinations: 'Coorg', num_travelers: '2', origin_city: 'Delhi' } })]);
      const card = document.querySelector('.trip-card-plan');
      expect(within(card).getByText('Weekend in Coorg')).toBeInTheDocument();
      expect(card.querySelector('.trip-card-line')).toHaveTextContent('Coorg · Planning in progress');
      expect(within(card).getByText('2 travellers')).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Continue planning →' })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    });

    it('a planning trip with no title is headed by its destination', async () => {
      await renderTrips([listItem({ id: 'trip-1', title: 'Untitled Trip', stage: 'planning', context: { destinations: 'Nainital' } })]);
      const card = document.querySelector('.trip-card-plan');
      expect(within(card).getByText('Nainital')).toBeInTheDocument();
      expect(card.querySelector('.trip-card-line')).toHaveTextContent('Planning in progress');
    });

    it('a draft day plan waiting for review says so and offers Review plan', async () => {
      await renderTrips([listItem({ id: 'trip-1', title: 'Weekend in Coorg', stage: 'planning', has_day_plan: true, context: { destinations: 'Coorg' } })]);
      const card = document.querySelector('.trip-card-plan');
      expect(card.querySelector('.trip-card-line')).toHaveTextContent('Draft plan ready to review');
      expect(within(card).getByRole('button', { name: 'Review plan →' })).toBeInTheDocument();
    });

    it('a finished trip is its own card: ending state, name, a facts line, Open trip', async () => {
      await renderTrips([listItem({
        id: 'trip-1', title: 'Quiet December Getaway', stage: 'planned', has_itinerary: true,
        context: { destinations: 'Dalhousie', travel_dates: 'December 2026', trip_duration: '4', num_travelers: '2', origin_city: 'Delhi' },
      })]);
      const card = document.querySelector('.trip-card-planned');
      expect(within(card).getByText('Itinerary ready')).toBeInTheDocument();
      expect(within(card).getByText('Quiet December Getaway')).toBeInTheDocument();
      expect(card.querySelector('.trip-card-facts')).toHaveTextContent('Dalhousie · December 2026 · 4 days · 2 travellers · From Delhi');
      expect(within(card).getByRole('button', { name: 'Open trip →' })).toBeInTheDocument();
      expect(card.querySelector('.trip-card-recap')).toBeNull();
    });

    it('a finished trip without an itinerary yet reads as an approved plan', async () => {
      await renderTrips([listItem({ id: 'trip-1', title: 'Goa break', stage: 'planned', context: { destinations: 'Goa' } })]);
      expect(within(document.querySelector('.trip-card-planned')).getByText('Plan approved')).toBeInTheDocument();
    });

    it('leads with Happening now, then Upcoming trips, then Discovering; Past trips stay collapsed', async () => {
      await renderTrips([
        listItem({ id: 'a', title: 'Ongoing trip', stage: 'planning', context: { destinations: 'Udaipur' }, travelWindow: { precision: 'month', month: thisMonth() } }),
        listItem({ id: 'b', title: 'Later trip', stage: 'planned', has_itinerary: true, context: { destinations: 'Goa' }, updated_at: '2025-12-01T00:00:00.000Z' }),
        listItem({ id: 'c', title: 'Old trip', stage: 'done', context: { destinations: 'Manali' } }),
        listItem({ id: 'd', title: 'Still deciding', stage: 'recommended', context: { origin_city: 'Delhi' } }),
      ]);
      const labels = [...document.querySelectorAll('.trip-group-label, .section-title')].map(el => el.textContent);
      expect(labels).toEqual(['Your trips', 'Happening now', 'Upcoming trips', 'Discovering']);
      expect(document.querySelector('.hero-trip')).toHaveTextContent('Ongoing trip');
      expect(screen.queryByText('Old trip')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /Past trips \(1\)/ }));
      expect(within(document.querySelector('.past-trips')).getByText('Old trip')).toBeInTheDocument();
      expect(within(document.querySelector('.past-trips')).queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    });

    it('a trip that is only upcoming is listed under Upcoming trips, not Happening now', async () => {
      await renderTrips([
        listItem({ id: 'a', title: 'Next year trip', stage: 'planned', has_itinerary: true, context: { destinations: 'Goa' }, travelWindow: { precision: 'month', month: '2099-01' } }),
      ]);
      expect(document.querySelector('.hero-trip')).toBeNull();
      const labels = [...document.querySelectorAll('.trip-group-label')].map(el => el.textContent);
      expect(labels).toEqual(['Upcoming trips']);
    });

    it('never calls a trip still being discovered "Happening now", even with an ongoing window', async () => {
      await renderTrips([
        listItem({ id: 'a', title: 'Picked trip', stage: 'matched', context: { destinations: 'Goa' }, travelWindow: { precision: 'month', month: thisMonth() } }),
        listItem({ id: 'b', title: 'Planned trip', stage: 'planning', context: { destinations: 'Udaipur' } }),
      ]);
      expect(document.querySelector('.hero-trip')).toBeNull();
    });
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
    // TWM-234: a trip still being recommended isn't "a trip" to the traveler
    // yet -- it gets its own "Discovering" section and its own CTA, separate
    // from "Your trips"/"Open trip" for anything already past matched.
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
      listItem({ id: 'trip-1', title: 'Committed trip', stage: 'planning', context: { origin_city: 'Delhi' } }),
      listItem({ id: 'trip-2', title: 'Untitled Trip', stage: 'recommended', context: { origin_city: 'Delhi' }, updated_at: '2025-12-01T00:00:00.000Z' }),
    ] }));
    renderDashboardHome(GUEST);
    await screen.findByText('Committed trip');
    expect(screen.getByText('Discovering')).toBeInTheDocument();
    expect(screen.getByText('Your trips')).toBeInTheDocument();
    const committedCard = screen.getByText('Committed trip').closest('.trip-card');
    expect(within(committedCard).getByRole('button', { name: 'Continue planning →' })).toBeInTheDocument();
    const discoveringCard = document.querySelector('.trip-card-discovering');
    expect(within(discoveringCard).getByRole('button', { name: 'Review recommendations →' })).toBeInTheDocument();
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

  // TWM-234: a Discovering card (matching / recommended) has no destination
  // yet. Heading, most to least preferred: the stored title (the traveler's
  // own or Meridian's), the most telling fact so far, then "New discovery".
  describe('Discovering cards', () => {
    const discovering = (overrides = {}) => listItem({ id: 'trip-1', stage: 'matching', ...overrides });
    async function renderCard(trip) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [trip] }));
      renderDashboardHome(GUEST);
      await screen.findByText('Discovering');
      return document.querySelector('.trip-card-discovering');
    }

    it('uses the stored title as the heading, with Rename and every fact as a chip', async () => {
      const card = await renderCard(discovering({
        title: '5 Day Getaway from Delhi', title_source: 'generated',
        context: { travel_dates: 'After Navratri', trip_duration: '5 days', origin_city: 'Delhi' },
      }));
      expect(within(card).getByText('5 Day Getaway from Delhi')).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Rename' })).toBeInTheDocument();
      expect(within(card).getByText('Destination not chosen yet')).toBeInTheDocument();
      expect(within(card).getByText('5 days')).toBeInTheDocument();
      expect(within(card).getByText('After Navratri')).toBeInTheDocument();
      expect(within(card).getByText('From Delhi')).toBeInTheDocument();
    });

    it('falls back to the most telling fact (dates first) and does not repeat it as a chip', async () => {
      const card = await renderCard(discovering({
        context: { origin_city: 'Delhi', num_travelers: '4', trip_duration: '5', travel_dates: 'After Navratri' },
      }));
      expect(within(card).getByText('After Navratri')).toBeInTheDocument();
      expect(within(card).queryByText(/travel_dates/)).not.toBeInTheDocument();
      expect(within(card).queryByText('Untitled Trip')).not.toBeInTheDocument();
    });

    it('turns a bare duration or party size into words, and ranks duration above party size', async () => {
      const card = await renderCard(discovering({ context: { num_travelers: '4', trip_duration: '5' } }));
      expect(within(card).getByText('5 days')).toBeInTheDocument();
      expect(within(card).getByText('4 travellers')).toBeInTheDocument();
    });

    it("never uses the origin as the heading -- it is the same on every trip -- and lists it last", async () => {
      const card = await renderCard(discovering({ context: { origin_city: 'Delhi', budget: '1 lakh INR' } }));
      expect(within(card).getByText('Budget: 1 lakh INR')).toBeInTheDocument();
      expect(within(card).getByText('From Delhi')).toBeInTheDocument();
      const only = await screen.findAllByText('From Delhi');
      expect(only).toHaveLength(1);
    });

    it('says "New discovery" when nothing identifying is known yet', async () => {
      const card = await renderCard(discovering({ context: { origin_city: 'Delhi' } }));
      expect(within(card).getByText('New discovery')).toBeInTheDocument();
      expect(within(card).getByText('From Delhi')).toBeInTheDocument();
      expect(within(card).queryByText('In conversation')).not.toBeInTheDocument();
    });

    it('Rename with no title yet starts from a blank input and saves the traveler\'s own title', async () => {
      routeFetch({
        trips: [discovering({ context: { origin_city: 'Delhi' } })],
        patch: () => tripView({ title: 'Puja holidays', version: 2 }),
      });
      renderDashboardHome(GUEST);
      await userEvent.click(await screen.findByRole('button', { name: 'Rename' }));
      const input = await screen.findByRole('textbox');
      expect(input).toHaveValue('');
      await userEvent.type(input, 'Puja holidays{Enter}');
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/trips/trip-1', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ expected_version: 1, title: 'Puja holidays' }),
      })));
    });

    it('words the one action for its stage', async () => {
      const exploring = await renderCard(discovering({ context: { origin_city: 'Delhi' } }));
      expect(within(exploring).getByRole('button', { name: 'Continue exploring →' })).toBeInTheDocument();
    });

    it('shows up to 4 chips with a "+N more" chip for the rest', async () => {
      const card = await renderCard(discovering({
        title: 'Puja holidays',
        context: { travel_dates: 'After Navratri', trip_duration: '5', num_travelers: '4', budget: '1 lakh INR', origin_city: 'Delhi' },
      }));
      const chips = within(card).getAllByText(/./, { selector: '.trip-card-recap-pill' });
      expect(chips).toHaveLength(5); // 4 shown facts + the "+N more" chip
      expect(within(card).getByText('+1 more')).toBeInTheDocument();
    });

    it('tidies the heading: capitalised, parenthetical aside dropped', async () => {
      const card = await renderCard(discovering({ context: { travel_dates: 'after Navratri (around Navami/Dashami)' } }));
      expect(within(card).getByText('After Navratri')).toBeInTheDocument();
    });

    it('lists the trips furthest along first: matched, then recommended, then matching', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [
        listItem({ id: 'a', title: 'Chat trip', stage: 'matching', context: { origin_city: 'Delhi' } }),
        listItem({ id: 'b', title: 'Reco trip', stage: 'recommended', context: { origin_city: 'Delhi' } }),
        listItem({ id: 'c', title: 'Picked trip', stage: 'matched', context: { origin_city: 'Delhi', destinations: 'Goa' } }),
      ] }));
      renderDashboardHome(GUEST);
      await screen.findByText('Discovering');
      const order = [...document.querySelectorAll('.trip-card-discovering .name')].map(el => el.textContent.replace('Rename', '').trim());
      expect(order).toEqual(['Picked trip', 'Reco trip', 'Chat trip']);
    });
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

    it('is visually its own card: the chosen destination is the "Your pick" hero, and only matched is marked', async () => {
      routeMatched({ trip: matchedTrip({ title: 'Puja holidays' }) });
      renderWithDashboardRoute();
      const card = (await screen.findByText('Puja holidays')).closest('.trip-card');
      expect(card).toHaveClass('trip-card-matched');
      expect(within(card).getByText('Your pick')).toBeInTheDocument();
      expect(within(card).getByText(DESTINATION)).toHaveClass('trip-card-destination-chosen');
    });

    it('a matched trip keeps its Meridian title like any other Discovering card, with the destination on its own line', async () => {
      routeMatched({ trip: matchedTrip({ title: '5 Day Getaway from Delhi', title_source: 'generated' }) });
      renderWithDashboardRoute();
      const card = (await screen.findByText('5 Day Getaway from Delhi')).closest('.trip-card');
      expect(within(card).getByText(DESTINATION)).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Rename' })).toBeInTheDocument();
      expect(within(card).queryByText('Unnamed trip')).not.toBeInTheDocument();
      expect(within(card).queryByText('Destination not chosen yet')).not.toBeInTheDocument();
    });

    it('a matched trip with no title yet is headed by its most telling fact, and Rename starts blank', async () => {
      routeMatched({
        trip: matchedTrip({ title: 'Untitled Trip', context: { origin_city: 'Delhi', destinations: DESTINATION, num_travelers: '4' } }),
        patch: () => tripView({ title: 'Family trip', version: 2 }),
      });
      renderWithDashboardRoute();
      expect(await screen.findByText('4 travellers')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
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
