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
let viewTrip;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand, tripLoadStatus, uiState, updateUiState, openTrip, viewTrip }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

function generalReference() {
  return { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null };
}

function atlasResult(overrides = {}) {
  return {
    final_itinerary: {
      trip_summary: {
        title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 2,
        date_range: null, overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.',
      },
      days: [
        {
          day_number: 1, date: null, title: 'Arrival and ghats', primary_location: 'Rishikesh',
          summary: 'Settle in and explore.',
          timeline: [{
            start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Triveni Ghat', location: 'Rishikesh',
            detail: 'Visit at a relaxed pace.', movement_guidance: null, estimated_cost_low: 0, estimated_cost_high: 0,
            reference: generalReference(), requires_advance_booking: false, booking_readiness: null,
          }],
          seasonal_guidance: 'Carry layers.', permit_or_ticket_guidance: 'None required.', backup_plan: null,
        },
        {
          day_number: 2, date: null, title: 'Ram Jhula', primary_location: 'Rishikesh',
          summary: 'A quieter second day.',
          timeline: [{
            start_time: 'Afternoon', end_time: null, kind: 'TRAVEL', title: 'Ram Jhula crossing', location: 'Rishikesh',
            detail: 'Cross the bridge.', movement_guidance: 'Short walk.', estimated_cost_low: 100, estimated_cost_high: 200,
            reference: generalReference(), requires_advance_booking: true, booking_readiness: 'unresolved',
          }],
          seasonal_guidance: 'Best in cooler months.', permit_or_ticket_guidance: 'None required.', backup_plan: 'Indoor market visit if it rains.',
        },
      ],
      budget_summary: {
        currency: 'INR',
        lines: [{ category: 'Stay', amount_low: 1600, amount_high: 3000, note: 'Two nights.' }],
        total_low: 1600, total_high: 3000, budget_fit: 'Within a typical budget.',
      },
      practical_notes: [{ category: 'Weather', title: 'Pack layers', detail: 'Evenings turn cool.', reference: generalReference() }],
      sources: [],
      assumptions: [{ category: 'dates', detail: 'Assumed a start date since none was confirmed.' }],
      ...overrides.final_itinerary,
    },
    unresolved: overrides.unresolved ?? [{ item: 'Exact bus timing', generic_guidance: 'Check schedules closer to travel.' }],
    agent_meta: { agent: 'atlas', prompt_version: '1.2.0' },
  };
}

// TWM-159/160: the full Atlas result no longer arrives inline on
// commandSnapshot — only the pointer (status/current_version.version) does.
// The body itself comes from a lazily-fetched GET /trips/{id}/itinerary,
// mocked below via `itineraryFetchResponse`.
function readyItineraryState({ version = 1, history = [], proposedRevision = null } = {}) {
  return {
    status: 'ready',
    current_version: { version, source_guide_revision: 3 },
    history,
    proposed_revision: proposedRevision,
  };
}

// TWM-175: Atlas rejects start_itinerary unless a plan is actually frozen —
// every fixture below is exercising the post-approval Atlas contract, so
// frozen_plan defaults present here (a dedicated thin-state describe block
// below covers the pre-frozen case explicitly).
function snapshotWith(itineraryState, { anchors = [], plannerState } = {}, { trip_context: tripContext = {} } = {}) {
  return {
    id: 'trip-1',
    version: 1,
    trip_state: {
      stage: 'planned',
      trip_context: tripContext,
      planner_state: plannerState ?? { frozen_plan: { guide_revision: 3, guide_state: {} } },
      itinerary_state: itineraryState,
      logistics_state: { anchors },
    },
  };
}

function anchor(overrides = {}) {
  return {
    id: 'anchor-1', type: 'transport', label: 'Delhi to Rishikesh arrival',
    detail: 'Confirmed arrival at 2:00 PM.', day_number: 1, reference: 'PNR-123', notes: null,
    confirmed_at_version: 1,
    ...overrides,
  };
}

function renderDashboard(initialEntries = ['/dashboard']) {
  return render(<MemoryRouter initialEntries={initialEntries}><TripDashboard /></MemoryRouter>);
}

// Renders and waits for the itinerary fetch to resolve so tab interactions
// have real content to click into (mirrors production: tabs only render
// once itineraryStatus === 'ready').
async function readyDashboard() {
  const view = renderDashboard();
  await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
  return view;
}

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let itineraryVersionsResponse;
let itineraryFetchResponse;

// TWM-132: a generic resolved SEARCH_REDIRECT action, reused as the default
// trusted-action fixture across Bookings-tab tests that don't care about
// the specific resolution outcome.
function resolvedActionResponse({ affiliate = true } = {}) {
  return {
    status: 'resolved',
    generated_at: '2026-01-01T00:00:00.000Z',
    action: {
      action_type: 'SEARCH_REDIRECT', domain: 'flight',
      target: { partner: 'ixigo', path: 'search', query_params: {}, target_url: 'https://www.ixigo.com/search' },
      internal_capability: null, affiliate_disclosure: affiliate, generated_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

// TWM-146: default flight-search fixture — clarification_needed, since the
// fixture trip has no per-day dates (atlasResult's days carry date: null),
// matching the honest "no exact IATA/date yet" state documented in
// bookingCatalog.js's searchFlightOffer.
function clarificationNeededResponse() {
  return {
    status: 'clarification_needed',
    queried_at: '2026-01-01T00:00:00.000Z',
    clarification: { missing_fields: ['origin', 'destination'], message: 'Tell us your exact route to search live prices.' },
  };
}

function defaultFetchMock() {
  return vi.fn(async (url) => {
    if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
    if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
    if (url.includes('/trusted-action/feasibility')) return jsonResponse(null);
    if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
    if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
    return jsonResponse({});
  });
}

describe('Trip Dashboard (real Atlas contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tripLoadStatus = 'ready';
    uiState = {};
    updateUiState = vi.fn(async () => {});
    openTrip = vi.fn(async () => ({ ok: true }));
    viewTrip = vi.fn(() => ({ ok: true }));
    // Prior versions are fetched lazily via GET /trips/{id}/itinerary-versions
    // (TWM-155) — default to empty; individual tests override as needed.
    itineraryVersionsResponse = { versions: [] };
    // The active itinerary body is fetched lazily via GET /trips/{id}/itinerary
    // (TWM-159/160) — default to a ready single-version result.
    itineraryFetchResponse = { version: 1, source_guide_revision: 3, result: atlasResult(), created_at: '2026-01-01T00:00:00.000Z' };
    global.fetch = defaultFetchMock();
  });

  // TWM-188: a deep-link/stale-tab to a trip with no trip_context yet is an
  // orphan, not a real trip — must bounce home instead of rendering blank.
  it('redirects home when the URL trip resolves to an empty (no trip_context) trip', async () => {
    commandSnapshot = { version: 1, trip_state: { stage: 'new', trip_context: {} } };
    sendTripCommand = vi.fn();
    renderDashboard(['/dashboard?tripId=trip-1']);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('does not redirect a trip reached with no URL tripId, even if empty', () => {
    commandSnapshot = { version: 1, trip_state: { stage: 'new', trip_context: {} } };
    sendTripCommand = vi.fn();
    renderDashboard(['/dashboard']);
    expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('calls start_itinerary once when no saved result exists, then renders it', async () => {
    commandSnapshot = snapshotWith({});
    sendTripCommand = vi.fn(async command => {
      if (command === 'start_itinerary') {
        commandSnapshot = snapshotWith(readyItineraryState());
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
    expect(sendTripCommand).toHaveBeenCalledTimes(1);
    expect(sendTripCommand).toHaveBeenCalledWith('start_itinerary');
  });

  it('reopen never re-invokes Atlas when a result is already saved', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  // TWM-184: the full itinerary-ready Dashboard is a separate render branch
  // from the thin state — needs its own back-link coverage.
  it('shows a "Back to your trips" link on the full itinerary-ready Dashboard', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    const link = screen.getByRole('link', { name: '← Back to your trips' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('shows an error state when itinerary generation fails', async () => {
    commandSnapshot = snapshotWith({});
    sendTripCommand = vi.fn().mockRejectedValue(new Error('The travel assistant returned an invalid response.'));
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The travel assistant returned an invalid response.'));
  });

  it('shows a loading state, then does not re-fire start_itinerary while the itinerary fetch is in flight', async () => {
    commandSnapshot = snapshotWith({});
    let resolveItinerary;
    const pendingItinerary = new Promise(resolve => { resolveItinerary = resolve; });
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
      if (url.endsWith('/itinerary')) return pendingItinerary.then(() => jsonResponse(itineraryFetchResponse));
      return jsonResponse({});
    });
    sendTripCommand = vi.fn(async command => {
      if (command === 'start_itinerary') {
        commandSnapshot = snapshotWith(readyItineraryState());
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    renderDashboard();

    // start_itinerary has resolved (commandSnapshot is now itinerary-ready)
    // but the lazy body fetch is still pending — the loader must stay up,
    // and the boot guard must not mistake that for "not ready yet" and
    // re-invoke start_itinerary.
    await waitFor(() => expect(sendTripCommand).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Loading your trip/)).toBeInTheDocument();
    expect(sendTripCommand).toHaveBeenCalledTimes(1);

    resolveItinerary();
    await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
    expect(sendTripCommand).toHaveBeenCalledTimes(1);
  });

  it('re-fetches the itinerary when tripId changes without unmounting, never showing the previous trip\'s result', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    let itineraryFetchCount = 0;
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
      if (url.endsWith('/itinerary')) {
        itineraryFetchCount += 1;
        return jsonResponse(itineraryFetchResponse);
      }
      return jsonResponse({});
    });
    const { rerender } = renderDashboard();
    await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
    expect(itineraryFetchCount).toBe(1);

    // Switch to a different, already-ready trip in place (no unmount) —
    // e.g. a future in-app trip switcher.
    commandSnapshot = {
      id: 'trip-2', version: 1,
      trip_state: {
        trip_context: {}, planner_state: { frozen_plan: { guide_revision: 3, guide_state: {} } },
        itinerary_state: readyItineraryState(), logistics_state: { anchors: [] },
      },
    };
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 4,
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Goa Escape', destinations: ['Goa'], duration_days: 2, num_travelers: 2, date_range: null, overview: '', route_rationale: '' } } }),
      created_at: '2026-01-02T00:00:00.000Z',
    };
    rerender(<MemoryRouter><TripDashboard /></MemoryRouter>);

    // Never renders trip-1's itinerary under trip-2 while its fetch is in flight.
    expect(screen.queryByText('Rishikesh Getaway')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Goa Escape')).toBeInTheDocument());
    expect(itineraryFetchCount).toBe(2);
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('shows an error state when the itinerary fetch fails, without re-invoking start_itinerary', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
      if (url.endsWith('/itinerary')) return jsonResponse({ detail: 'No itinerary yet.' }, { status: 404 });
      return jsonResponse({});
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No itinerary yet.'));
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('renders assumptions and unresolved items safely', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/Assumed a start date since none was confirmed\./)).toBeInTheDocument());
    expect(screen.getByText(/Check schedules closer to travel\./)).toBeInTheDocument();
  });

  // TWM-175: Stays/Transport tabs (and their confirm-logistics form UI) are
  // intentionally removed this story — Bookings is a real, deliberate inert
  // placeholder until the Bookings, Docs & Support story lands next. The
  // underlying confirm_logistics command is unchanged and untested here on
  // purpose; that coverage returns with the real Bookings tab.
  // TWM-176: real Bookings content, replacing TWM-175's inert placeholder.
  //
  // Skipped: the Bookings tab is temporarily removed from nav (TABS) while
  // booking options move inline into the Itinerary tab — these tests all
  // navigate via the "Bookings" nav button, which no longer renders. The
  // underlying BookingSegment/TransportOptionCard/etc. rendering code these
  // tests exercise is unchanged; re-enable (updating navigation to whatever
  // replaces the nav-button click, or once Bookings returns to nav) once
  // that follow-up lands.
  describe.skip('Bookings tab (TWM-176)', () => {
    it('shows the origin<->destination transport leg, not just local transfers, bundled as one round-trip decision', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      // Fixture: both days are Rishikesh, so the round trip is Delhi <-> Rishikesh.
      expect(screen.getByText('Delhi ⇄ Rishikesh round trip')).toBeInTheDocument();
    });

    it('expanding a segment shows mode-tagged options; an infeasible mode is genuinely absent, with the Backend-provided explanatory note', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/trusted-action/feasibility')) {
          return jsonResponse({
            modes: [
              { mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'Fastest option.', estimated_duration_minutes: 90 },
              { mode: 'train', status: 'feasible', duration_source: 'llm_estimated', reason: 'A comfortable overland option.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
              { mode: 'bus', status: 'ruled_out', duration_source: 'llm_estimated', reason: 'Bus excluded — a 14h journey is not practical for a 2-day trip.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
              { mode: 'drive', status: 'feasible', duration_source: 'computed', reason: 'Also drivable.' },
            ],
          });
        }
        if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);

      await waitFor(() => expect(screen.getAllByText(/Flight/).length).toBeGreaterThan(0));
      // Bus is ruled_out per the mocked feasibility assessment — genuinely
      // absent from the options grid, not just faded.
      expect(screen.queryByText(/^Bus:/)).not.toBeInTheDocument();
      expect(screen.getAllByText(/Bus excluded/).length).toBeGreaterThan(0);
    });

    it('shows the "why other modes aren\'t shown" feasibility row, with a GENERAL_GUIDANCE tag for the llm_estimated train mode', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/trusted-action/feasibility')) {
          return jsonResponse({
            modes: [
              { mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'Fastest option.', estimated_duration_minutes: 90 },
              { mode: 'train', status: 'feasible', duration_source: 'llm_estimated', reason: 'A comfortable overland option.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
              { mode: 'bus', status: 'ruled_out', duration_source: 'llm_estimated', reason: 'Not practical for this trip.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
              { mode: 'drive', status: 'feasible', duration_source: 'computed', reason: 'Also drivable.' },
            ],
          });
        }
        if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);

      await waitFor(() => expect(screen.getByText("Why other modes aren't shown")).toBeInTheDocument());
      await user.click(screen.getByText("Why other modes aren't shown"));
      const disclosure = screen.getByText("Why other modes aren't shown").closest('details');
      expect(within(disclosure).getByText('Not practical for this trip.')).toBeInTheDocument();
      expect(within(disclosure).getAllByText('General guidance').length).toBeGreaterThan(0);
    });

    it('shows a specific "not booked yet" label per segment, never a bare generic one', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      await readyDashboard();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      expect(screen.getByText('Delhi ⇄ Rishikesh round trip not booked yet')).toBeInTheDocument();
      expect(screen.queryByText('Not booked yet')).not.toBeInTheDocument();
    });

    it('shows a confirmed segment with the 🔒-confirmed treatment — property/service name, price/detail, and confirmation number, never a bare status word', async () => {
      commandSnapshot = snapshotWith(
        readyItineraryState(), { anchors: [anchor({ type: 'stay', label: 'Rishikesh · 2 nights', detail: 'Riverside Cottage, ₹4,200/night', reference: 'CONF-9921' })] },
        { trip_context: { origin_city: 'Delhi' } },
      );
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      expect(screen.getByText('🔒 confirmed')).toBeInTheDocument();
      expect(screen.getByText('Riverside Cottage, ₹4,200/night')).toBeInTheDocument();
      expect(screen.getByText('✓ CONF-9921')).toBeInTheDocument();
    });

    it('Activity category only appears when a real Atlas item genuinely requires advance booking — never as an empty section', async () => {
      commandSnapshot = snapshotWith(readyItineraryState());
      sendTripCommand = vi.fn();
      await readyDashboard();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      // Fixture has no ACTIVITY item with requires_advance_booking: true.
      expect(screen.queryByRole('heading', { name: /Activity/ })).not.toBeInTheDocument();
    });

    it('shows the Activity category with a real Atlas-flagged item, framed as the exception not the norm', async () => {
      commandSnapshot = snapshotWith(readyItineraryState());
      itineraryFetchResponse = {
        version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({
          final_itinerary: {
            days: [{
              day_number: 1, date: null, title: 'Arrival', primary_location: 'Rishikesh', summary: 'x',
              timeline: [{
                start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Rafting', location: 'Rishikesh',
                detail: 'Book a slot ahead — limited daily capacity.', movement_guidance: null,
                estimated_cost_low: null, estimated_cost_high: null,
                reference: generalReference(), requires_advance_booking: true, booking_readiness: 'needs_advance_booking',
              }],
              seasonal_guidance: 'x', permit_or_ticket_guidance: 'x', backup_plan: null,
            }],
          },
        }),
      };
      global.fetch = defaultFetchMock();
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      expect(screen.getByRole('heading', { name: /Activity/ })).toBeInTheDocument();
      expect(screen.getByText(/the exception, not the norm/)).toBeInTheDocument();
      expect(screen.getByText('Rafting not booked yet')).toBeInTheDocument();
    });

    it('renders the affiliate disclosure line when the resolved trusted action carries it, never dropping it', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);
      await waitFor(() => expect(screen.getAllByText(/This is an affiliate link/).length).toBeGreaterThan(0));
    });

    it('shows an inert note, no broken link, when a trusted action resolves to missing_input', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(null);
        if (url.includes('/trusted-action')) return jsonResponse({ status: 'missing_input', generated_at: '2026-01-01T00:00:00.000Z', missing_input: { missing_fields: ['origin'], message: 'Tell us the missing details.' } });
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);
      await waitFor(() => expect(screen.getAllByText(/Flight/).length).toBeGreaterThan(0));
      expect(document.querySelector('a[href*="ixigo"]')).toBeNull();
    });

    // Skipped: the "Already booked this yourself? Add a confirmation" entry
    // point is temporarily removed from BookingSegment/ActivitySegment.
    // Re-enable once that affordance returns — the underlying
    // confirm_logistics command wiring this test exercises is unchanged.
    it.skip('the confirm-it-yourself flow is reachable per segment, and submits a real confirm_logistics command', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn(async () => ({ message: 'Noted.', agent_meta: null, trip: commandSnapshot }));
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Bookings/ }));
      await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);
      await user.click(screen.getByText('Add a confirmation →'));
      await user.type(screen.getByLabelText('Details'), 'Confirmed 8:00 AM flight, PNR ABC123.');
      await user.click(screen.getByRole('button', { name: 'Save confirmation' }));

      expect(sendTripCommand).toHaveBeenCalledWith('confirm_logistics', expect.objectContaining({
        logisticsConfirmation: expect.objectContaining({ type: 'transport', label: 'Delhi ⇄ Rishikesh round trip' }),
      }));
    });

    // TWM-146: live flight-offer cards on the flight TransportOptionCard —
    // distinct from the plain redirect-only cards train/bus still use.
    describe('flight live-offer card (TWM-146)', () => {
      it('renders a specific clarification prompt (not a generic error) when flight-search needs more info', async () => {
        commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
        sendTripCommand = vi.fn();
        global.fetch = defaultFetchMock(); // flight-search defaults to clarification_needed
        const user = userEvent.setup();
        await readyDashboard();
        await user.click(screen.getByRole('button', { name: /Bookings/ }));
        await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);
        await waitFor(() => expect(screen.getAllByText(/Tell us your exact route to search live prices\./).length).toBeGreaterThan(0));
      });

      it('renders live-offer price/airline/stops distinctly from the plain redirect-only cards, and still keeps the CTA link separate', async () => {
        commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
        sendTripCommand = vi.fn();
        global.fetch = vi.fn(async url => {
          if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
          if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
          if (url.includes('/trusted-action/feasibility')) return jsonResponse(null);
          if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
          if (url.includes('/flight-search')) {
            return jsonResponse({
              status: 'offer',
              queried_at: '2026-01-01T00:00:00.000Z',
              offers: [{
                origin_iata: 'DEL', destination_iata: 'DED', trip_type: 'round_trip',
                departure_date: '2026-03-01', return_date: '2026-03-05',
                money: { currency: 'INR', per_traveler_amount_minor_units: 400000, traveler_count: 2, group_total_minor_units: 800000, group_total_is_approximate: true },
                baggage: { checked_bag_included: null, cabin_bag_included: null },
                fare_conditions: { refundable: null, changeable: null },
                provenance: { provider_name: 'aviasales', provider_reference: 'ref-1' },
                price_found_at: '2026-01-01T00:00:00.000Z',
                airline_name: 'IndiGo', stop_count: 0, is_recommended: true,
              }],
            });
          }
          return jsonResponse({});
        });
        const user = userEvent.setup();
        await readyDashboard();
        await user.click(screen.getByRole('button', { name: /Bookings/ }));
        await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);

        await waitFor(() => expect(screen.getAllByText('Live offer').length).toBeGreaterThan(0));
        expect(screen.getAllByText(/approx\. INR 8,?000\.00/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/IndiGo/).length).toBeGreaterThan(0);
        // The trusted-action CTA (ixigo redirect) is still present and separate
        // from the live-offer data block — the offer itself carries no url.
        expect(document.querySelector('a[href*="ixigo"]')).not.toBeNull();
      });

      it('renders the Backend-authored unavailable message safely for a flight card', async () => {
        commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
        sendTripCommand = vi.fn();
        global.fetch = vi.fn(async url => {
          if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
          if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
          if (url.includes('/trusted-action/feasibility')) return jsonResponse(null);
          if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
          if (url.includes('/flight-search')) {
            return jsonResponse({ status: 'unavailable', queried_at: '2026-01-01T00:00:00.000Z', unavailable: { code: 'provider_timeout', message: 'The flight provider timed out — try again shortly.' } });
          }
          return jsonResponse({});
        });
        const user = userEvent.setup();
        await readyDashboard();
        await user.click(screen.getByRole('button', { name: /Bookings/ }));
        await user.click(screen.getAllByRole('button', { name: 'Resolve ▾' })[0]);
        await waitFor(() => expect(screen.getAllByText(/The flight provider timed out — try again shortly\./).length).toBeGreaterThan(0));
      });
    });
  });

  it('has no remaining reference to /logistics?tab=... anywhere on the redesigned Dashboard', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(document.querySelector('a[href^="/logistics"]')).toBeNull();
  });

  it('shows a proposed-revision banner and resolves it via accept', async () => {
    commandSnapshot = snapshotWith(readyItineraryState({
      proposedRevision: { version: 2, base_version: 1, affected_days: [1], changes: ['Day 1: updated for confirmed arrival'], triggered_by: { anchor_id: 'a1', type: 'transport', label: 'x' }, result: atlasResult() },
    }));
    sendTripCommand = vi.fn(async command => {
      if (command === 'accept_itinerary_revision') {
        commandSnapshot = snapshotWith(readyItineraryState({ version: 2 }));
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = userEvent.setup();
    await readyDashboard();
    expect(screen.getByText(/This affects Day 1/)).toBeInTheDocument();
    expect(screen.getByText('Day 1: updated for confirmed arrival')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept the changes' }));
    expect(sendTripCommand).toHaveBeenCalledWith('accept_itinerary_revision');
    await waitFor(() => expect(screen.queryByText(/This affects Day 1/)).not.toBeInTheDocument());
  });

  it('keep current discards the proposal without changing the version', async () => {
    commandSnapshot = snapshotWith(readyItineraryState({
      proposedRevision: { version: 2, base_version: 1, affected_days: [1], changes: ['Day 1: updated'], triggered_by: { anchor_id: 'a1', type: 'transport', label: 'x' }, result: atlasResult() },
    }));
    sendTripCommand = vi.fn(async command => {
      if (command === 'keep_current_itinerary') {
        commandSnapshot = snapshotWith(readyItineraryState());
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: 'Keep current itinerary' }));
    expect(sendTripCommand).toHaveBeenCalledWith('keep_current_itinerary');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept the changes' })).not.toBeInTheDocument());
  });

  it('shows an inline error and preserves the banner when accept fails', async () => {
    commandSnapshot = snapshotWith(readyItineraryState({
      proposedRevision: { version: 2, base_version: 1, affected_days: [1], changes: ['Day 1: updated'], triggered_by: { anchor_id: 'a1', type: 'transport', label: 'x' }, result: atlasResult() },
    }));
    sendTripCommand = vi.fn().mockRejectedValue(new Error('Trip has a newer version.'));
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: 'Accept the changes' }));
    await waitFor(() => expect(screen.getByText('Trip has a newer version.')).toBeInTheDocument());
    expect(screen.getByText(/This affects Day 1/)).toBeInTheDocument();
  });

  it('places an anchor under the matching day, not other days', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { anchors: [anchor({ day_number: 2, label: 'Riverside stay' })] });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Itinerary/ }));
    expect(screen.queryByText('Riverside stay')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Day 2/ }));
    expect(screen.getByText('Riverside stay')).toBeInTheDocument();
  });

  // TWM-175: the Map tab is gone — it was never a real map, just route
  // order, which now folds into Overview's day-strip instead. Bookings and
  // Docs are temporarily out of nav (merged/hidden) while booking options
  // move inline into Itinerary.
  it('shows the 3 active tabs, never the old Stays/Transport/Map/Bookings/Docs ones', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    for (const name of ['Overview', 'Itinerary', 'Support']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /Stays/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Transport/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Map/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bookings/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Docs/ })).not.toBeInTheDocument();
  });

  it('Overview\'s day-strip jumps into that day on the Itinerary tab', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { anchors: [anchor({ day_number: 2, label: 'Riverside stay' })] });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    const dayStrip = screen.getByRole('navigation', { name: 'Trip days' });
    await user.click(within(dayStrip).getByText('2'));
    expect(screen.getByRole('navigation', { name: 'Select a day' })).toBeInTheDocument();
    expect(screen.getByText('Riverside stay')).toBeInTheDocument();
  });

  it('Overview renders real budget_summary totals and stat tiles', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { anchors: [anchor()] });
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getByText('Within a typical budget.')).toBeInTheDocument();
    expect(screen.getAllByText(/₹1,600–₹3,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Days').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 days').length).toBeGreaterThan(0);
  });

  it('Overview\'s Days stat uses the travel-window label when no real dates are set', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 2, date_range: 'October', overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } }),
    };
    global.fetch = defaultFetchMock();
    await readyDashboard();
    expect(screen.getAllByText('October').length).toBeGreaterThan(0);
  });

  it('Overview\'s Days stat prefers real per-day dates over the travel-window label', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    const base = atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 2, date_range: 'October', overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } });
    base.final_itinerary.days = base.final_itinerary.days.map((day, index) => ({ ...day, date: index === 0 ? '2026-10-12' : '2026-10-13' }));
    itineraryFetchResponse = { version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z', result: base };
    global.fetch = defaultFetchMock();
    await readyDashboard();
    expect(screen.getAllByText('2026-10-12 – 2026-10-13').length).toBeGreaterThan(0);
  });

  it('renders unsafe text as inert content, never as markup', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { assumptions: [{ category: 'other', detail: '<img src=x onerror=alert(1)>' }] } }),
    };
    global.fetch = defaultFetchMock();
    sendTripCommand = vi.fn();
    renderDashboard();
    await waitFor(() => expect(screen.getByText((_, el) => el.tagName === 'LI' && el.textContent.includes('<img src=x onerror=alert(1)>'))).toBeInTheDocument());
    expect(document.querySelector('img')).toBeNull();
  });

  // TWM-175: party size regression — trip_summary.travelers doesn't exist on
  // the real Atlas schema (the field is num_travelers); reading the wrong
  // key always silently defaulted the displayed count to 2.
  it('displays the real num_travelers count, not a hardcoded default of 2', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 5, date_range: null, overview: 'x', route_rationale: 'y' } } }),
    };
    global.fetch = defaultFetchMock();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('2').filter(el => el.closest('.hero-stats'))).toHaveLength(0);
  });

  // Skipped: the TrustStrip (Assumptions/Open items/Evidence basis) is
  // temporarily removed from Overview's render. trustStripCounts() itself
  // (exercised in atlasView.test.js) is unchanged — re-enable if/when this
  // strip returns to the UI.
  it.skip('trust strip is visible without any user action — no closed-by-default disclosure', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    const trustStrip = screen.getByLabelText('Trip trust summary');
    expect(trustStrip).toBeVisible();
    // Fixture: 1 assumption, 1 unresolved item, all references GENERAL_GUIDANCE.
    expect(within(trustStrip).getAllByText('1')).toHaveLength(2);
    expect(within(trustStrip).getByText(/general guidance/)).toBeInTheDocument();
  });

  it('renders route_rationale and trip_summary.overview on Overview', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('A calm riverside trip.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Everything is within one town.').length).toBeGreaterThan(0);
  });

  it('shows an honest empty state for genuinely-empty sources, not a hidden/blank section', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getByText('No external sources cited.')).toBeInTheDocument();
  });

  // TWM-175: verified/general-guidance (outline) and booking-readiness
  // (filled) are visually distinct axes — a timeline item carrying both
  // must render both, not collapse to one.
  it('renders both an outline verification tag and a filled booking-readiness tag on the same item', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Itinerary/ }));
    await user.click(screen.getByRole('button', { name: /Day 2/ }));
    const item = screen.getByText('Ram Jhula crossing').closest('.atlas-item');
    const verification = within(item).getByText('General guidance');
    const readiness = within(item).getByText('Readiness unresolved');
    expect(verification.className).toContain('status-pill-outline');
    expect(readiness.className).toContain('status-pill-filled');
  });

  describe('arrival transition and one-time booking prompt (TWM-175)', () => {
    it('shows the honest-transition screen while the itinerary is generating, calibrated to a long wait', async () => {
      commandSnapshot = snapshotWith({});
      sendTripCommand = vi.fn(() => new Promise(() => {})); // never resolves — stays mid-generation
      renderDashboard();
      expect(await screen.findByRole('status', { name: 'Building your itinerary' })).toBeInTheDocument();
      expect(screen.queryByText(/Building your detailed itinerary/)).not.toBeInTheDocument();
    });

    // Regression: proves the 20s-per-step cadence is actually wired through
    // to HonestTransition, not just present as an unused/dropped prop — the
    // default step, cleared at 1100ms, must still be "active" here.
    it('honors the 20s-per-step cadence, not HonestTransition\'s 1100ms default', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      commandSnapshot = snapshotWith({});
      sendTripCommand = vi.fn(() => new Promise(() => {}));
      render(<MemoryRouter><TripDashboard /></MemoryRouter>);

      await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
      expect(screen.getAllByRole('listitem')[0]).toHaveClass('active');
      expect(screen.getAllByRole('listitem')[0]).not.toHaveClass('done');

      await act(async () => { await vi.advanceTimersByTimeAsync(19000); }); // total 20100ms — past the real cadence
      expect(screen.getAllByRole('listitem')[0]).toHaveClass('done');
      vi.useRealTimers();
    });

    it('shows the one-time booking prompt only on a real fresh generation, and persists that it was shown', async () => {
      commandSnapshot = snapshotWith({});
      sendTripCommand = vi.fn(async command => {
        if (command === 'start_itinerary') commandSnapshot = snapshotWith(readyItineraryState());
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      renderDashboard();

      const prompt = await screen.findByRole('dialog', { name: "Your itinerary is ready" });
      expect(within(prompt).getByText(/sort out bookings now, or take a look/)).toBeInTheDocument();
      await waitFor(() => expect(updateUiState).toHaveBeenCalledWith({ 'dashboardOverview.bookingPromptShown': true }));

      await user.click(within(prompt).getByText('Sort out bookings now'));
      // Bookings is temporarily out of TABS (nav) — the prompt still sets
      // tab state to 'Bookings' internally, just with no nav button to
      // assert "active" against until Bookings returns to nav or this CTA
      // is repointed at Itinerary's inline booking options.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('never shows the booking prompt again once ui_state already recorded it as shown', async () => {
      uiState = { 'dashboardOverview.bookingPromptShown': true };
      commandSnapshot = snapshotWith({});
      sendTripCommand = vi.fn(async command => {
        if (command === 'start_itinerary') commandSnapshot = snapshotWith(readyItineraryState());
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      await readyDashboard();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('never shows the booking prompt on a reopen of an already-generated itinerary', async () => {
      commandSnapshot = snapshotWith(readyItineraryState());
      sendTripCommand = vi.fn();
      await readyDashboard();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(sendTripCommand).not.toHaveBeenCalled();
    });
  });

  describe('thin-state Dashboard — reachable from message one (TWM-175)', () => {
    it('opens successfully with only trip_context populated and no itinerary — no crash, no blank page', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      await screen.findByText('Your trip so far');
      expect(screen.getByText('Origin')).toBeInTheDocument();
      expect(screen.getByText('Delhi')).toBeInTheDocument();
      expect(sendTripCommand).not.toHaveBeenCalled();
    });

    // TWM-182: mockup fidelity — the tab bar is present even before a plan
    // exists, not only once itinerary-ready. Tapping a non-Overview tab
    // shows an honest "not ready yet" placeholder instead of navigating
    // into the full tabbed dashboard's data-fetching logic.
    it('shows the tab bar in the thin state, with non-Overview tabs rendering an honest placeholder', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const tabs = await screen.findByRole('navigation', { name: 'Trip Dashboard tabs' });
      expect(within(tabs).getByText('Overview')).toBeInTheDocument();
      expect(within(tabs).getByText('Itinerary')).toBeInTheDocument();
      expect(within(tabs).getByText('Support')).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(within(tabs).getByText('Itinerary'));

      expect(screen.getByText('Your day-by-day plan will appear here once Guide finishes it.')).toBeInTheDocument();
      expect(screen.queryByText('Your trip so far')).not.toBeInTheDocument();
    });

    // TWM-184: there was previously no way back from a per-trip Dashboard to
    // the trips list at all — confirmed absent via grep before this fix.
    it('shows a "Back to your trips" link pointing at Home', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const link = await screen.findByRole('link', { name: '← Back to your trips' });
      expect(link).toHaveAttribute('href', '/');
    });

    it('shows budget as a row in "Your trip so far" when present, and omits it when absent', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin: 'Delhi', budget: '₹1,00,000 total for both' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const facts = await screen.findByText('Your trip so far');
      const budgetRow = within(facts.closest('.trip-facts')).getByText('Budget').closest('.trip-facts-row');
      expect(within(budgetRow).getByText('₹1,00,000 total for both')).toBeInTheDocument();
    });

    it('omits the Budget row entirely when trip_context has no budget', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const facts = await screen.findByText('Your trip so far');
      expect(within(facts.closest('.trip-facts')).queryByText('Budget')).not.toBeInTheDocument();
    });

    // TWM-182: mockup fidelity — a single bottom primary CTA, always
    // pointing at whichever step is actually actionable right now.
    it('shows a bottom primary CTA pointing at destination discovery when Route is not yet done', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      await screen.findByText('Your trip so far');
      const buttons = screen.getAllByRole('button', { name: 'Continue chat →' });
      expect(buttons).toHaveLength(2); // one as the Destination row's CTA, one as the bottom primary CTA
    });

    it('shows a bottom primary CTA pointing at Day plan once Route is done', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: {
          stage: 'planning',
          trip_context: { destinations: ['Udaipur'] },
          planner_state: { conversation_context: { awaiting: 'trip_duration' }, places: [], day_plan: [] },
          itinerary_state: {}, logistics_state: { anchors: [] },
        },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      await screen.findByRole('button', { name: 'Continue chat →' });
      const buttons = screen.getAllByRole('button', { name: 'Continue chat →' });
      expect(buttons).toHaveLength(1); // Destination is settled (no row CTA); only the bottom primary CTA remains
    });

    // Note: "both Route and Day plan done but still on the thin-state board"
    // isn't reachable through this component — a frozen day plan graduates
    // the page straight into the itinerary-boot flow (see the `frozenPlan`
    // effect above). That "no primary CTA" case is covered as a pure unit
    // test on dashboardPrimaryCta itself, in dashboardTracks.test.js.

    // TWM-185: a hard reload/bookmark on /dashboard?tripId=... must resolve
    // that trip — commandSnapshot starts null/mismatched (no prior
    // viewTrip/openTrip call happened this session), just like a real reload.
    it('resolves the trip named by ?tripId= via viewTrip when landing fresh, with no prior commandSnapshot', async () => {
      commandSnapshot = null;
      sendTripCommand = vi.fn();
      renderDashboard(['/dashboard?tripId=trip-1']);
      await waitFor(() => expect(viewTrip).toHaveBeenCalledWith('trip-1'));
    });

    // TWM-182: viewTrip's cache-only render can leave commandSnapshot null
    // once its background existence check 404s while the traveler is
    // already looking at this page — must not fall through to an
    // empty-looking thin state.
    it('shows a clear "trip unavailable" message instead of an empty thin state when commandSnapshot is null', async () => {
      commandSnapshot = null;
      sendTripCommand = vi.fn();
      renderDashboard();
      expect(await screen.findByRole('alert')).toHaveTextContent('This trip is no longer available.');
      expect(screen.getByRole('button', { name: 'Back to your trips' })).toBeInTheDocument();
    });

    // TWM-182: every CTA lands on a decision-making page (ScoutChat/
    // Destinations/TripPreview) that needs real planner_state/matcher_state
    // — never safe off ThinStateDashboard's possibly cache-only tripState.
    // The click must ensure a full fetch first, regardless of how the
    // Dashboard itself was reached.
    it('a CTA click ensures full detail (openTrip) before navigating', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'planning', trip_context: { destinations: ['Udaipur'] }, planner_state: { conversation_context: { awaiting: 'trip_duration' }, places: [], day_plan: [] }, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const button = await screen.findByRole('button', { name: 'Continue chat →' });

      const user = userEvent.setup();
      await user.click(button);

      expect(openTrip).toHaveBeenCalledWith('trip-1');
    });

    it('never attempts to boot Atlas before a plan is frozen', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'planning', trip_context: {}, planner_state: { conversation_context: {}, places: [], day_plan: [] }, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      await screen.findByText('Your trip so far');
      expect(sendTripCommand).not.toHaveBeenCalled();
    });

    it('unknown-destination Discover path (still gathering): Destination row shows "Continue chat"', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const facts = await screen.findByText('Your trip so far');
      const destinationRow = within(facts.closest('.trip-facts')).getByText('Destination').closest('.trip-facts-row');
      expect(within(destinationRow).getByRole('button', { name: 'Continue chat →' })).toBeInTheDocument();
    });

    it('unknown-destination Discover path (recommendations ready): Destination row shows "Review recommendations"', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const facts = await screen.findByText('Your trip so far');
      const destinationRow = within(facts.closest('.trip-facts')).getByText('Destination').closest('.trip-facts-row');
      expect(within(destinationRow).getByRole('button', { name: 'Review recommendations →' })).toBeInTheDocument();
    });

    it('known-destination path: Destination row shows the stated destination with no CTA', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: {
          stage: 'planning',
          trip_context: { origin: 'Delhi', destinations: ['Udaipur'] },
          planner_state: { conversation_context: { awaiting: 'trip_duration' }, places: [], day_plan: [] },
          itinerary_state: {}, logistics_state: { anchors: [] },
        },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const facts = await screen.findByText('Your trip so far');
      const destinationRow = within(facts.closest('.trip-facts')).getByText('Destination').closest('.trip-facts-row');
      expect(within(destinationRow).getByText('Udaipur')).toBeInTheDocument();
      expect(within(destinationRow).queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
