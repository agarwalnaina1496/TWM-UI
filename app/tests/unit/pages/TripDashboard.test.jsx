import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripDashboard from '../../../src/pages/TripDashboard.jsx';

let commandSnapshot;
let sendTripCommand;
let tripLoadStatus;
let uiState;
let updateUiState;
let openTrip;
let setCurrentTripId;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand, tripLoadStatus, uiState, updateUiState, currentTripId: commandSnapshot?.id ?? null, setCurrentTripId, prefetchTrip: openTrip }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

const generalReference = () => ({ status: 'GENERAL_GUIDANCE', source_title: null, source_url: null });

// TWM-217/TWM-220: the enriched Atlas document GET /trips/{id}/itinerary
// returns — each timeline item pre-enriched with id / is_gateway_leg /
// resolved_date / date_precision / date_source, plus a top-level
// stay_segments[]. The fixture is a Delhi <-> Rishikesh, 2-day trip.
function enrichedItem(over) {
  return { estimated_cost_low: 0, estimated_cost_high: 0, movement_guidance: null, reference: generalReference(), booking_readiness: null, resolved_date: null, date_precision: 'none', date_source: 'none', is_gateway_leg: false, ...over };
}
function enrichedDoc({ trip_summary = {}, budget_summary = {}, days, staySegments, practical_notes = [], assumptions = [], before_you_go } = {}) {
  const d = days ?? [
    {
      day_number: 1, title: 'Arrival and ghats', primary_location: 'Rishikesh', summary: 'Settle in.',
      backup_plan: null,
      notes: [{ category: 'Weather', title: 'Carry layers', detail: 'Carry layers.', needs_verification: false }],
      timeline: [
        enrichedItem({ id: 'test-trip:1:0', kind: 'TRAVEL', title: 'Arrival from Delhi', location: 'Rishikesh', detail: 'Arrive from Delhi.', from_city: 'Delhi', to_city: 'Rishikesh', is_gateway_leg: true }),
        enrichedItem({ id: 'test-trip:1:1', kind: 'STAY', title: 'Overnight in Rishikesh', location: 'Rishikesh', detail: 'Stay near the ghats.', estimated_cost_low: 1600, estimated_cost_high: 3000, booking_readiness: 'needs_advance_booking' }),
        enrichedItem({ id: 'test-trip:1:2', kind: 'ACTIVITY', title: 'Triveni Ghat', location: 'Rishikesh', detail: 'Visit at a relaxed pace.' }),
      ],
    },
    {
      day_number: 2, title: 'Ram Jhula', primary_location: 'Rishikesh', summary: 'A quieter day.',
      backup_plan: 'Indoor market visit if it rains.',
      notes: [{ category: 'Weather', title: 'Cooler months', detail: 'Best in cooler months.', needs_verification: true }],
      timeline: [
        enrichedItem({ id: 'test-trip:2:0', kind: 'STAY', title: 'Second night in Rishikesh', location: 'Rishikesh', detail: 'Same base.', estimated_cost_low: 1600, estimated_cost_high: 3000, booking_readiness: 'needs_advance_booking' }),
        enrichedItem({ id: 'test-trip:2:1', kind: 'TRAVEL', title: 'Return to Delhi', location: 'Delhi', detail: 'Return to Delhi.', from_city: 'Rishikesh', to_city: 'Delhi', is_gateway_leg: true }),
      ],
    },
  ];
  const seg = staySegments ?? [{
    id: 'test-trip:stay:1:2:rishikesh', location: 'Rishikesh', start_day_number: 1, end_day_number: 2,
    nights: 2, date_precision: 'none', checkin_date: null, checkout_date: null, month: null, date_source: 'none',
    board_item_ids: ['test-trip:1:1', 'test-trip:2:0'],
  }];
  return {
    version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
    result: {
      final_itinerary: {
        trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], trip_duration: 2, num_travelers: 2, overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.', ...trip_summary },
        days: d,
        budget_summary: { currency: 'INR', lines: [{ category: 'Stay', amount_low: 1600, amount_high: 3000, note: 'Two nights.' }], total_low: 1600, total_high: 3000, ...budget_summary },
        practical_notes, sources: [], assumptions,
      },
      stay_segments: seg,
    },
  };
}

// commandSnapshot is a TripView.
function recap(entries) { return Object.entries(entries).map(([key, value]) => ({ key, label: key, value })); }
function baseView(over = {}) {
  return {
    id: 'trip-1', version: 1, title: 'Rishikesh Getaway', product_mode: 'self_led', ui_state: {},
    lifecycle: { stage: 'planned', status: 'free', active_agent: null, selected_option: null },
    context_recap: recap(over.context ?? {}),
    plan: over.plan ?? { places: ['x'], day_plan: [{ day_number: 1 }], frozen: true, awaiting: null },
    matcher: { last_message: null, awaiting: null, has_recommendation: false },
    summary: over.summary ?? null,
    booking: over.booking ?? null,
    budget_breakdown: over.budget_breakdown ?? null,
    open_gaps: over.open_gaps ?? null,
    before_you_go: over.before_you_go ?? null,
  };
}
function summaryFor(over = {}) {
  return {
    title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2,
    overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.',
    travelers: { value: '~2', exact: null, source: 'itinerary_estimate' },
    dates: { precision: 'none', departure: null, return: null, month: null, label: null, source: 'none' },
    budget: { low: 1600, high: 3000, currency: 'INR' },
    ...over,
  };
}
function budgetFor(over = {}) {
  return { fit_note: 'Within a typical budget.', lines: [{ category: 'Stay', low: 1600, high: 3000, note: 'Two nights.' }], estimated_for_travelers: 2, party_changed_since: false, ...over };
}
// A frozen-but-not-yet-generated trip → boots start_itinerary.
const frozenView = (over = {}) => baseView({ ...over, summary: null });
// A generated trip → fetches /itinerary and renders.
function readyView(over = {}) {
  return baseView({
    context: over.context,
    summary: summaryFor(over.summary),
    budget_breakdown: budgetFor(over.budget_breakdown),
    open_gaps: over.open_gaps ?? [],
    before_you_go: over.before_you_go ?? [],
    booking: over.booking ?? { party: null },
    plan: over.plan,
  });
}
// A pre-frozen (thin-state) trip.
function thinView(over = {}) {
  return {
    id: 'trip-1', version: 1, title: 'T', product_mode: 'self_led', ui_state: {},
    lifecycle: { stage: over.stage ?? 'matching', status: 'free', active_agent: null, selected_option: null },
    context_recap: recap(over.context ?? { origin_city: 'Delhi' }),
    plan: over.plan ?? null,
    matcher: { last_message: null, awaiting: null, has_recommendation: over.hasRecommendation ?? false },
    summary: null, booking: null, budget_breakdown: null, open_gaps: null, before_you_go: null,
  };
}

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let itineraryResponse;

const feasibility = () => ({ modes: [
  { mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'Fastest.', estimated_duration_minutes: 90, verification: generalReference() },
  { mode: 'train', status: 'feasible', duration_source: 'computed', reason: 'Overland.', verification: generalReference() },
  { mode: 'bus', status: 'feasible', duration_source: 'computed', reason: 'Practical.', verification: generalReference() },
  { mode: 'drive', status: 'feasible', duration_source: 'computed', reason: 'Drivable.', verification: generalReference() },
] });

function resolvedAction(partner = 'aviasales', url = `https://www.${partner === 'booking_com' ? 'booking' : partner}.com/search`) {
  return { action_type: 'SEARCH_REDIRECT', domain: 'flight', target: { partner, path: 'search', query_params: {}, target_url: url }, internal_capability: null, affiliate_disclosure: true, capability: 'prefilled_search', cta_label: `Search ${partner}`, capability_note: null };
}
function stayAction(partner) {
  const m = { booking_com: ['https://www.booking.com/searchresults.html?ss=Rishikesh', 'Search Booking.com'], agoda: ['https://www.agoda.com/search?city=1', 'Search Agoda'], ixigo: ['https://www.ixigo.com/hotels/hotels-in-rishikesh', 'Browse ixigo hotels'] }[partner];
  return { action_type: 'SEARCH_REDIRECT', domain: 'stay', target: { partner, path: 'search', query_params: {}, target_url: m[0] }, internal_capability: null, affiliate_disclosure: false, capability: 'destination_search', cta_label: m[1], capability_note: null };
}

function bookingOptionsResponse(body) {
  return {
    results: (body.targets || []).map(target => {
      if (target.kind === 'mode') return { target, status: 'resolved', generated_at: 't', action: resolvedAction(target.value === 'flight' ? 'aviasales' : target.value) };
      return { target, status: 'resolved', generated_at: 't', action: stayAction(target.value) };
    }),
  };
}

const flightClarification = () => ({ status: 'clarification_needed', clarification: { missing_fields: ['origin', 'destination'], message: 'Tell us your exact route to search live prices.' } });

function makeFetch(over = {}) {
  return vi.fn(async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    if (url.endsWith('/itinerary')) return jsonResponse(over.itinerary ?? itineraryResponse);
    if (url.includes('/trusted-action/feasibility')) return jsonResponse(over.feasibility ?? feasibility());
    if (url.includes('/booking-options')) {
      over.onBooking?.(body);
      return jsonResponse((over.booking ?? bookingOptionsResponse)(body));
    }
    if (url.includes('/flight-search')) return jsonResponse((over.flight ?? flightClarification)());
    return jsonResponse({});
  });
}

function renderDashboard(initialEntries = ['/dashboard']) {
  return render(<MemoryRouter initialEntries={initialEntries}><TripDashboard /></MemoryRouter>);
}
async function readyDashboard() {
  const view = renderDashboard();
  await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
  return view;
}
async function openTransportDrawer() {
  const user = userEvent.setup();
  await readyDashboard();
  await user.click(screen.getByRole('button', { name: /Itinerary/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
  await user.click(screen.getAllByRole('button', { name: /Transport options/ })[0]);
  return user;
}
async function openStayDrawer() {
  const user = userEvent.setup();
  await readyDashboard();
  await user.click(screen.getByRole('button', { name: /Itinerary/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Stay options/ })).toBeInTheDocument());
  await user.click(screen.getAllByRole('button', { name: /Stay options/ })[0]);
  return user;
}

describe('Trip Dashboard (TripView + enriched itinerary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tripLoadStatus = 'ready';
    uiState = {};
    updateUiState = vi.fn(async () => {});
    openTrip = vi.fn(async () => ({ ok: true }));
    setCurrentTripId = vi.fn();
    itineraryResponse = enrichedDoc();
    global.fetch = makeFetch();
  });

  it('redirects home when the URL trip resolves to an empty trip', async () => {
    commandSnapshot = thinView({ stage: 'new', context: {} });
    sendTripCommand = vi.fn();
    renderDashboard(['/dashboard?tripId=trip-1']);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('does not redirect a trip reached with no URL tripId', () => {
    commandSnapshot = thinView({ stage: 'new', context: {} });
    sendTripCommand = vi.fn();
    renderDashboard(['/dashboard']);
    expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('calls start_itinerary once when no summary exists yet, then renders it', async () => {
    commandSnapshot = frozenView();
    sendTripCommand = vi.fn(async () => {
      commandSnapshot = readyView();
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
    expect(sendTripCommand).toHaveBeenCalledTimes(1);
    expect(sendTripCommand).toHaveBeenCalledWith('start_itinerary');
  });

  it('never re-invokes Atlas when a summary already exists', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('shows a "Back to your trips" link on the itinerary-ready Dashboard', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getByRole('link', { name: '← Back to your trips' })).toHaveAttribute('href', '/');
  });

  it('shows an error state when itinerary generation fails', async () => {
    commandSnapshot = frozenView();
    sendTripCommand = vi.fn().mockRejectedValue(new Error('The travel assistant returned an invalid response.'));
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The travel assistant returned an invalid response.'));
  });

  it('shows an error state when the itinerary fetch fails, without re-invoking start_itinerary', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    global.fetch = vi.fn(async url => (url.endsWith('/itinerary') ? jsonResponse({ detail: 'No itinerary yet.' }, { status: 404 }) : jsonResponse({})));
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No itinerary yet.'));
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('re-fetches the itinerary when the trip version changes without unmounting', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    let count = 0;
    global.fetch = vi.fn(async url => {
      if (url.endsWith('/itinerary')) { count += 1; return jsonResponse(itineraryResponse); }
      return jsonResponse({});
    });
    const { rerender } = renderDashboard();
    await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
    expect(count).toBe(1);

    commandSnapshot = { ...readyView({ summary: { title: 'Goa Escape' } }), version: 2 };
    itineraryResponse = enrichedDoc({ trip_summary: { title: 'Goa Escape' } });
    rerender(<MemoryRouter><TripDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Goa Escape')).toBeInTheDocument());
    await waitFor(() => expect(count).toBe(2));
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  // ---- Overview (100% from TripView) ------------------------------------

  it('renders the composed budget breakdown on Overview', async () => {
    commandSnapshot = readyView({ budget_breakdown: budgetFor({ fit_note: 'Estimated INR 1,600–INR 3,000.' }) });
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getByText('Estimated INR 1,600–INR 3,000.')).toBeInTheDocument();
    expect(screen.getAllByText(/₹1,600–₹3,000/).length).toBeGreaterThan(0);
  });

  it('renders route_rationale and overview on the hero', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('A calm riverside trip.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Everything is within one town.').length).toBeGreaterThan(0);
  });

  it('renders a calm "Before you go" list with a verify chip, and no Trust strip / Sources / Unresolved', async () => {
    commandSnapshot = readyView({ before_you_go: [
      { title: 'Carry cash', detail: 'ATMs are sparse.', verify: true },
      { title: 'Where you\'ll stay', detail: 'Assumed a Fort base.', verify: true },
    ] });
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getByText('Carry cash')).toBeInTheDocument();
    expect(screen.getAllByText('verify').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Trip trust summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Sources')).not.toBeInTheDocument();
    expect(screen.queryByText('❓ Unresolved')).not.toBeInTheDocument();
    expect(screen.queryByText(/Trip notes/)).not.toBeInTheDocument();
  });

  it('shows the hero traveler value from summary.travelers', async () => {
    commandSnapshot = readyView({ summary: summaryFor({ travelers: { value: '2 adults, 1 infant', exact: { adults: 2, children: 0, infants: 1 }, source: 'party' } }) });
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('2 adults, 1 infant').filter(el => el.closest('.hero-stats')).length).toBeGreaterThan(0);
  });

  it('shows "Not set" for the hero traveler value only when it is null', async () => {
    commandSnapshot = readyView({ summary: summaryFor({ travelers: { value: null, exact: null, source: 'unknown' } }) });
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('Not set').filter(el => el.closest('.hero-stats')).length).toBeGreaterThan(0);
  });

  // ---- Itinerary tab ---------------------------------------------------

  it('renders the enriched day-by-day itinerary with backup_plan as its own row and a verify chip on a needs_verification note', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Itinerary/ }));
    expect(screen.getByText('Carry layers')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Day 2/ }));
    expect(screen.getByText(/If plans change/)).toBeInTheDocument();
    expect(screen.getByText('Indoor market visit if it rains.')).toBeInTheDocument();
    const note = screen.getByText('Cooler months').closest('li');
    expect(within(note).getByText('verify')).toBeInTheDocument();
  });

  it('shows the 3 tabs, never the retired ones', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    await readyDashboard();
    for (const name of ['Overview', 'Itinerary', 'Support']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    for (const gone of [/Stays/, /^Map/, /Bookings/, /Docs/]) {
      expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument();
    }
  });

  it('renders both an outline verification tag and a filled booking-readiness tag on the same item', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Itinerary/ }));
    const item = screen.getByText('Overnight in Rishikesh').closest('.atlas-item');
    expect(within(item).getByText('General guidance').className).toContain('status-pill-outline');
    expect(within(item).getByText('Needs advance booking').className).toContain('status-pill-filled');
  });

  // ---- Transport drawer (one batch call) -----------------------------

  it('opens the gateway-leg drawer and resolves options with ONE booking-options request', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    const bodies = [];
    global.fetch = makeFetch({ onBooking: b => bodies.push(b) });
    const user = await openTransportDrawer();

    const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
    await waitFor(() => expect(within(drawer).getAllByText(/Flight|Train|Bus|Drive/).length).toBeGreaterThan(0));
    expect(bodies.filter(b => b.domain === 'transport')).toHaveLength(1);
    expect(bodies[0].targets.map(t => t.value)).toEqual(['flight', 'train', 'bus']);
    // TWM-228: a leg with no resolved date shows the date picker expanded and blank.
    expect(within(drawer).getByLabelText('Leg date')).toHaveValue('');
    expect(within(drawer).queryByRole('button', { name: /Add a date for this search/ })).toBeNull();
    void user;
  });

  it('carries the structured party on the booking-options request', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' }, booking: { party: { adults: 2, children: 1, infants: 0 } } });
    sendTripCommand = vi.fn();
    const bodies = [];
    global.fetch = makeFetch({ onBooking: b => bodies.push(b) });
    await openTransportDrawer();
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    expect(bodies[0].party).toEqual({ adults: 2, children: 1, infants: 0 });
  });

  it('lists only the infeasible modes in the collapsed section', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    global.fetch = makeFetch({ feasibility: { modes: [{ mode: 'bus', status: 'feasible', duration_source: 'computed', reason: 'Practical.', verification: generalReference() }] } });
    const user = await openTransportDrawer();
    const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
    await waitFor(() => expect(within(drawer).getByText('3 not available for this route', { exact: false })).toBeInTheDocument());
    await user.click(within(drawer).getByText('3 not available for this route', { exact: false }));
    expect(within(drawer).getAllByText('Not available for this route.').length).toBe(3);
  });

  it('closes on the close button and on clicking the overlay', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    const user = await openTransportDrawer();
    await user.click(await screen.findByRole('button', { name: 'Close transport options' }));
    expect(screen.queryByRole('dialog', { name: /Delhi to Rishikesh/ })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Transport options/ })[0]);
    await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
    await user.click(document.querySelector('.transport-drawer-overlay'));
    expect(screen.queryByRole('dialog', { name: /Delhi to Rishikesh/ })).not.toBeInTheDocument();
  });

  it('renders a specific flight-search clarification prompt in the drawer', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    await openTransportDrawer();
    await waitFor(() => expect(screen.getAllByText(/Tell us your exact route to search live prices\./).length).toBeGreaterThan(0));
  });

  it('renders a live flight offer distinctly from the affiliate CTA', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    global.fetch = makeFetch({ flight: () => ({ status: 'offer', date_precision: 'exact', offers: [{
      money: { currency: 'INR', per_traveler_amount_minor_units: 400000, group_total_minor_units: 800000, group_total_is_approximate: true },
      airline_name: 'IndiGo', stop_count: 0, price_found_at: 't', is_recommended: true,
    }] }) });
    await openTransportDrawer();
    await waitFor(() => expect(screen.getAllByText('Cached price').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/approx\. INR 8,?000\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/IndiGo/).length).toBeGreaterThan(0);
    expect(document.querySelector('a[href*="aviasales"]')).not.toBeNull();
    expect(screen.getAllByText('Check availability on Aviasales ↗').length).toBeGreaterThan(0);
  });

  it('does not render an affiliate-disclosure line even when the action carries one', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    await openTransportDrawer();
    await waitFor(() => expect(screen.getAllByRole('link', { name: /↗/ }).length).toBeGreaterThan(0));
    expect(screen.queryByText(/This is an affiliate link/)).toBeNull();
  });

  it('saves a per-leg search date via set_search_pref and refetches without closing', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    const bodies = [];
    sendTripCommand = vi.fn(async (command, payload) => {
      expect(command).toBe('set_search_pref');
      expect(payload.searchPrefUpdate).toEqual({ target_type: 'transport', target_id: 'test-trip:1:0', date: '2026-11-01' });
      itineraryResponse = enrichedDoc({ days: withLegDate('2026-11-01') });
      commandSnapshot = { ...readyView({ context: { origin_city: 'Delhi' } }), version: 2 };
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    global.fetch = makeFetch({ onBooking: b => bodies.push(b) });
    const user = await openTransportDrawer();
    const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
    await waitFor(() => expect(within(drawer).getAllByText(/Flight|Train|Bus/).length).toBeGreaterThan(0));
    const before = bodies.length;

    // TWM-228: the picker is already expanded for a dateless leg.
    await user.type(within(drawer).getByLabelText('Leg date'), '2026-11-01');
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_search_pref', expect.anything()));
    await waitFor(() => expect(bodies.length).toBeGreaterThan(before));
    expect(bodies.slice(before).some(b => b.departure_date === '2026-11-01')).toBe(true);
  });

  // ---- Stay drawer ---------------------------------------------------

  it('opens the stay-segment drawer and resolves partners with ONE booking-options request', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    const bodies = [];
    global.fetch = makeFetch({ onBooking: b => bodies.push(b) });
    const user = await openStayDrawer();
    const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
    await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
    expect(within(drawer).getByRole('heading', { name: /Rishikesh.*2 nights/ })).toBeInTheDocument();
    expect(within(drawer).getByText('Browse ixigo hotels ↗')).toBeInTheDocument();
    const stayBodies = bodies.filter(b => b.domain === 'stay');
    expect(stayBodies).toHaveLength(1);
    expect(stayBodies[0].destination).toBe('Rishikesh');
    expect(stayBodies[0].targets.map(t => t.value)).toEqual(['booking_com', 'agoda', 'ixigo']);
    void user;
  });

  it('shows the non-binding tiered estimate when Atlas provides one', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    const days = enrichedDoc().result.final_itinerary.days;
    days[0].stay_price_estimate = [
      { tier: 'budget', estimated_cost_low: 1000, estimated_cost_high: 2000 },
      { tier: 'premium', estimated_cost_low: 6000, estimated_cost_high: 12000 },
    ];
    itineraryResponse = enrichedDoc({ days });
    global.fetch = makeFetch();
    await openStayDrawer();
    const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
    expect(within(drawer).getByText('Rough nightly rate · not a quote')).toBeInTheDocument();
    expect(within(drawer).getByText('₹1,000–₹2,000')).toBeInTheDocument();
  });

  it('never shows an "Our pick" badge on a stay partner card', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    await openStayDrawer();
    const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
    await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
    expect(within(drawer).queryByText('Our pick')).not.toBeInTheDocument();
  });

  it('shows a resolved check-in/check-out range collapsed behind "Change", with a reset for an override', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    itineraryResponse = enrichedDoc({ staySegments: [{
      id: 'test-trip:stay:1:2:rishikesh', location: 'Rishikesh', start_day_number: 1, end_day_number: 2,
      nights: 2, date_precision: 'exact', checkin_date: '2026-11-01', checkout_date: '2026-11-03', month: null,
      date_source: 'search_pref', board_item_ids: ['test-trip:1:1', 'test-trip:2:0'],
    }] });
    global.fetch = makeFetch();
    const user = await openStayDrawer();
    const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
    // Collapsed by default — the range is shown, the picker is not.
    expect(within(drawer).getByText(/Nov 1 →.*Nov 3/)).toBeInTheDocument();
    expect(within(drawer).queryByLabelText('Check-in')).toBeNull();
    await user.click(within(drawer).getByRole('button', { name: 'Change' }));
    expect(within(drawer).getByLabelText('Check-in')).toHaveValue('2026-11-01');
    expect(within(drawer).getByLabelText('Check-out')).toHaveValue('2026-11-03');
    // An explicit override offers a reset to the itinerary dates.
    expect(within(drawer).getByRole('button', { name: /Reset to itinerary/ })).toBeInTheDocument();
  });

  // ---- Party editor -------------------------------------------------

  it('shows "Set travellers" in the drawer when the party is unknown, and saves via set_party keeping it open', async () => {
    commandSnapshot = readyView({ context: { origin_city: 'Delhi' }, booking: { party: null } });
    sendTripCommand = vi.fn(async (command, payload) => {
      expect(command).toBe('set_party');
      expect(payload.partyUpdate).toEqual({ adults: 1, children: 0, infants: 0 });
      commandSnapshot = { ...readyView({ context: { origin_city: 'Delhi' }, booking: { party: { adults: 1, children: 0, infants: 0 } } }), version: 2 };
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = await openTransportDrawer();
    const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
    await user.click(within(drawer).getByRole('button', { name: /Add guests/ }));
    await user.click(within(drawer).getByRole('button', { name: 'Save travelers' }));
    await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_party', expect.anything()));
    await waitFor(() => expect(
      within(screen.getByRole('dialog', { name: /Delhi to Rishikesh/ })).getByText('1 adult'),
    ).toBeInTheDocument());
  });

  // ---- arrival transition + booking prompt -------------------------

  it('shows the honest-transition screen while the itinerary is generating', async () => {
    commandSnapshot = frozenView();
    sendTripCommand = vi.fn(() => new Promise(() => {}));
    renderDashboard();
    expect(await screen.findByRole('status', { name: 'Building your itinerary' })).toBeInTheDocument();
  });

  it('honors the 20s-per-step cadence', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    commandSnapshot = frozenView();
    sendTripCommand = vi.fn(() => new Promise(() => {}));
    render(<MemoryRouter><TripDashboard /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('active');
    expect(screen.getAllByRole('listitem')[0]).not.toHaveClass('done');
    await act(async () => { await vi.advanceTimersByTimeAsync(19000); });
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('done');
    vi.useRealTimers();
  });

  it('shows the one-time booking prompt on a fresh generation and persists it', async () => {
    commandSnapshot = frozenView();
    sendTripCommand = vi.fn(async () => {
      commandSnapshot = readyView();
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = userEvent.setup();
    renderDashboard();
    const prompt = await screen.findByRole('dialog', { name: 'Your itinerary is ready' });
    await waitFor(() => expect(updateUiState).toHaveBeenCalledWith({ 'dashboardOverview.bookingPromptShown': true }));
    await user.click(within(prompt).getByText('Sort out bookings now'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Itinerary/ })).toHaveClass('active');
  });

  it('never shows the booking prompt once ui_state recorded it', async () => {
    uiState = { 'dashboardOverview.bookingPromptShown': true };
    commandSnapshot = frozenView();
    sendTripCommand = vi.fn(async () => {
      commandSnapshot = readyView();
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    await readyDashboard();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never shows the booking prompt on a reopen of an already-generated itinerary', async () => {
    commandSnapshot = readyView();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  // ---- thin-state Dashboard --------------------------------------

  it('opens with only context populated and no itinerary — no crash', async () => {
    commandSnapshot = thinView({ stage: 'matching', context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    renderDashboard();
    await screen.findByText('Your trip so far');
    expect(screen.getByText('Delhi')).toBeInTheDocument();
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('shows the tab bar in the thin state, non-Overview tabs rendering a placeholder', async () => {
    commandSnapshot = thinView({ stage: 'matching' });
    sendTripCommand = vi.fn();
    renderDashboard();
    const tabs = await screen.findByRole('navigation', { name: 'Trip Dashboard tabs' });
    expect(within(tabs).getByText('Overview')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(tabs).getByText('Support'));
    expect(screen.getByText('Available once your itinerary is ready.')).toBeInTheDocument();
  });

  it('shows a "Back to your trips" link in the thin state', async () => {
    commandSnapshot = thinView({ stage: 'matching' });
    sendTripCommand = vi.fn();
    renderDashboard();
    expect(await screen.findByRole('link', { name: '← Back to your trips' })).toHaveAttribute('href', '/');
  });

  it('shows budget as a row in "Your trip so far" when present', async () => {
    commandSnapshot = thinView({ stage: 'matching', context: { origin_city: 'Delhi', budget: '₹1,00,000 total for both' } });
    sendTripCommand = vi.fn();
    renderDashboard();
    const facts = await screen.findByText('Your trip so far');
    const budgetRow = within(facts.closest('.trip-facts')).getByText('budget').closest('.trip-facts-row');
    expect(within(budgetRow).getByText('₹1,00,000 total for both')).toBeInTheDocument();
  });

  it('shows a bottom primary CTA pointing at discovery when Route is not done', async () => {
    commandSnapshot = thinView({ stage: 'matching', context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    renderDashboard();
    await screen.findByText('Your trip so far');
    expect(screen.getAllByRole('button', { name: 'Continue chat →' })).toHaveLength(2);
  });

  it('points currentTripId at the trip named by ?tripId= when landing fresh', async () => {
    commandSnapshot = null;
    sendTripCommand = vi.fn();
    renderDashboard(['/dashboard?tripId=trip-1']);
    await waitFor(() => expect(setCurrentTripId).toHaveBeenCalledWith('trip-1'));
  });

  it('shows a "trip unavailable" message when commandSnapshot is null', async () => {
    commandSnapshot = null;
    sendTripCommand = vi.fn();
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent('This trip is no longer available.');
    expect(screen.getByRole('button', { name: 'Back to your trips' })).toBeInTheDocument();
  });

  it('a CTA click points currentTripId at the trip before navigating', async () => {
    commandSnapshot = thinView({ stage: 'planning', context: { destinations: 'Udaipur' }, plan: { places: [], day_plan: [], frozen: false, awaiting: 'trip_duration' } });
    sendTripCommand = vi.fn();
    renderDashboard();
    const button = await screen.findByRole('button', { name: 'Continue chat →' });
    await userEvent.setup().click(button);
    expect(setCurrentTripId).toHaveBeenCalledWith('trip-1');
  });

  it('never attempts to boot Atlas before a plan is frozen', async () => {
    commandSnapshot = thinView({ stage: 'planning', context: {}, plan: { places: [], day_plan: [], frozen: false, awaiting: null } });
    sendTripCommand = vi.fn();
    renderDashboard();
    await screen.findByText('Your trip so far');
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('unknown-destination Discover path: Destination row shows "Continue chat"', async () => {
    commandSnapshot = thinView({ stage: 'matching', context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    renderDashboard();
    const facts = await screen.findByText('Your trip so far');
    const row = within(facts.closest('.trip-facts')).getByText('Destination').closest('.trip-facts-row');
    expect(within(row).getByRole('button', { name: 'Continue chat →' })).toBeInTheDocument();
  });

  it('recommendations-ready: Destination row shows "Review recommendations"', async () => {
    commandSnapshot = thinView({ stage: 'recommended', context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    renderDashboard();
    const facts = await screen.findByText('Your trip so far');
    const row = within(facts.closest('.trip-facts')).getByText('Destination').closest('.trip-facts-row');
    expect(within(row).getByRole('button', { name: 'Review recommendations →' })).toBeInTheDocument();
  });

  it('known-destination: Destination row shows the destination with no CTA', async () => {
    commandSnapshot = thinView({ stage: 'planning', context: { origin_city: 'Delhi', destinations: 'Udaipur' }, plan: { places: [], day_plan: [], frozen: false, awaiting: 'trip_duration' } });
    sendTripCommand = vi.fn();
    renderDashboard();
    const facts = await screen.findByText('Your trip so far');
    const row = within(facts.closest('.trip-facts')).getByText('Destination').closest('.trip-facts-row');
    expect(within(row).getByText('Udaipur')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });
});

// Day 1 gateway leg dated 2026-11-01 via a search pref.
function withLegDate(date) {
  const days = enrichedDoc().result.final_itinerary.days;
  days[0].timeline[0] = { ...days[0].timeline[0], resolved_date: date, date_precision: 'exact', date_source: 'search_pref' };
  return days;
}
