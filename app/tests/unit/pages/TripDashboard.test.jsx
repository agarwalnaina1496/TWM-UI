import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripDashboard from '../../../src/pages/TripDashboard.jsx';
import { transportLegs, gatewayLegs } from '../../../src/lib/bookingCatalog.js';
import { tripOriginCity, tripBookingDateContext } from '../../../src/constants/tripContext.js';

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
          timeline: [
            {
              // TWM-200: the canonical origin<->destination movement now comes
              // from a structured TRAVEL item, not a bookend fabricated purely
              // from trip_context.origin_city.
              start_time: 'Morning', end_time: null, kind: 'TRAVEL', title: 'Arrival from Delhi', location: 'Rishikesh',
              detail: 'Arrive from Delhi.', movement_guidance: null, from_city: 'Delhi', to_city: 'Rishikesh',
              estimated_cost_low: 0, estimated_cost_high: 0,
              reference: generalReference(), requires_advance_booking: false, booking_readiness: null,
            },
            {
              start_time: 'Evening', end_time: null, kind: 'STAY', title: 'Overnight in Rishikesh', location: 'Rishikesh',
              detail: 'Stay near the ghats.', movement_guidance: null, estimated_cost_low: 1600, estimated_cost_high: 3000,
              reference: generalReference(), requires_advance_booking: true, booking_readiness: 'needs_advance_booking',
            },
            {
              start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Triveni Ghat', location: 'Rishikesh',
              detail: 'Visit at a relaxed pace.', movement_guidance: null, estimated_cost_low: 0, estimated_cost_high: 0,
              reference: generalReference(), requires_advance_booking: false, booking_readiness: null,
            },
          ],
          notes: [
            { category: 'Weather', title: 'Carry layers', detail: 'Carry layers.', reference: generalReference() },
            { category: 'Access', title: 'No permits', detail: 'None required.', reference: generalReference() },
          ],
          backup_plan: null,
        },
        {
          day_number: 2, date: null, title: 'Ram Jhula', primary_location: 'Rishikesh',
          summary: 'A quieter second day.',
          timeline: [
            {
              start_time: 'Afternoon', end_time: null, kind: 'TRAVEL', title: 'Ram Jhula crossing', location: 'Rishikesh',
              detail: 'Cross the bridge.', movement_guidance: 'Short walk.', estimated_cost_low: 100, estimated_cost_high: 200,
              reference: generalReference(), requires_advance_booking: true, booking_readiness: 'unresolved',
            },
            {
              start_time: 'Evening', end_time: null, kind: 'STAY', title: 'Second night in Rishikesh', location: 'Rishikesh',
              detail: 'Stay in the same Rishikesh base.', movement_guidance: null, estimated_cost_low: 1600, estimated_cost_high: 3000,
              reference: generalReference(), requires_advance_booking: true, booking_readiness: 'needs_advance_booking',
            },
            {
              // TWM-200 review finding: the return-to-origin leg must come
              // from its own structured TRAVEL movement — UI no longer
              // synthesizes an origin bookend leg on its own.
              start_time: 'Evening', end_time: null, kind: 'TRAVEL', title: 'Return to Delhi', location: 'Delhi',
              detail: 'Return to Delhi.', movement_guidance: null, from_city: 'Rishikesh', to_city: 'Delhi',
              estimated_cost_low: 0, estimated_cost_high: 0,
              reference: generalReference(), requires_advance_booking: false, booking_readiness: null,
            },
          ],
          notes: [
            { category: 'Weather', title: 'Cooler months', detail: 'Best in cooler months.', reference: generalReference() },
            { category: 'Access', title: 'No permits', detail: 'None required.', reference: generalReference() },
          ],
          backup_plan: 'Indoor market visit if it rains.',
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
// TWM-196: flight's SEARCH_REDIRECT partner is Aviasales/Travelpayouts,
// replacing the earlier ixigo placeholder — matches the real Backend
// contract (twm/schemas/trusted_action.py's
// _ALLOWED_PARTNERS_BY_DOMAIN["flight"]).
function resolvedActionResponse({ affiliate = true } = {}) {
  return {
    status: 'resolved',
    generated_at: '2026-01-01T00:00:00.000Z',
    action: {
      action_type: 'SEARCH_REDIRECT', domain: 'flight',
      target: { partner: 'aviasales', path: 'search', query_params: {}, target_url: 'https://www.aviasales.com/search' },
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

// TWM-195 root-fix contract: default feasibility fixture — all four modes
// genuinely route-valid for the fixture's Delhi <-> Rishikesh route
// (TripFeasibilityAssessment.modes is the only field now — no
// excluded_modes), so tests unrelated to feasibility semantics (e.g.
// TWM-146's flight-card tests) still reach a bookable Transport card. A
// `null`/missing assessment, or `modes: []`, must resolve zero transport
// modes on the UI side — tests that specifically exercise that path mock
// feasibility as `null`/empty explicitly rather than relying on this
// default.
function feasibleAssessmentResponse() {
  return {
    modes: [
      { mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'Fastest option.', estimated_duration_minutes: 90, verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
      { mode: 'train', status: 'feasible', duration_source: 'computed', reason: 'A comfortable overland option.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
      { mode: 'bus', status: 'feasible', duration_source: 'computed', reason: 'Also practical for this trip.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
      { mode: 'drive', status: 'feasible', duration_source: 'computed', reason: 'Also drivable.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
    ],
  };
}

// TWM-202/TWM-206: synthesizes a GET /trips/{id}/board response the same
// shape TripDashboard.jsx now consumes, computed from a test's own
// itineraryFetchResponse/tripContext fixtures using the exact same
// gateway-leg identification the pre-adapter client code used to (reused
// here only for test-mock fidelity, not by the component under test any
// more) — so a test only has to say what feasibility a gateway leg should
// carry, not hand-author a full board payload.
function boardResponseFor(itineraryResult, tripContext, feasibility = feasibleAssessmentResponse()) {
  const days = itineraryResult.result.final_itinerary.days;
  const originCity = tripOriginCity(tripContext);
  const bookingDateContext = tripBookingDateContext(tripContext);
  const allLegs = transportLegs(days, bookingDateContext, originCity);
  const gatewayKeys = new Set(gatewayLegs(allLegs, originCity).map(leg => `${leg.from}→${leg.to}`));
  const legByKey = Object.fromEntries(allLegs.map(leg => [`${leg.from}→${leg.to}`, leg]));
  const tripStart = bookingDateContext?.precision === 'exact'
    ? new Date(`${bookingDateContext.departure_date}T00:00:00Z`)
    : null;
  return {
    version: itineraryResult.version,
    days: days.map(day => ({
      ...day,
      date: tripStart
        ? new Date(tripStart.getTime() + (day.day_number - 1) * 86_400_000).toISOString().slice(0, 10)
        : null,
      items: day.timeline.map(item => {
        if (item.kind !== 'TRAVEL' || !item.from_city || !item.to_city) {
          return { ...item, is_gateway_leg: false, feasible_modes: null, date_precision: null };
        }
        const key = `${item.from_city}→${item.to_city}`;
        const isGateway = gatewayKeys.has(key);
        const leg = legByKey[key] || {};
        return {
          ...item,
          is_gateway_leg: isGateway,
          feasible_modes: isGateway ? (feasibility?.modes || []) : null,
          date_precision: leg.departureDate ? 'exact' : leg.departureMonth ? 'month' : 'flexible',
          departure_date: leg.departureDate || null,
          departure_month: leg.departureMonth || null,
        };
      }),
    })),
  };
}

function defaultFetchMock() {
  return vi.fn(async (url) => {
    if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
    if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
    if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
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

  // TWM-206: the Bookings tab itself is retired — Transport/Stay resolution
  // now happens via the Itinerary item's own drawer (opened below through
  // "Transport options"/"Stay options" instead of a Bookings tab + "Resolve
  // ▾"). Structural Bookings-tab-only tests (gateway-leg listing, the
  // BookingSegment "not booked yet"/🔒-confirmed treatment, the Activity
  // category display) were retired outright — that UI no longer exists and
  // gateway-leg-only rendering is already covered by "Itinerary inline
  // Set-dates (TWM-206)" below. The FlightLiveOfferInfo/date-nudge tests
  // that exercised real component-level bugs (not just tab shape) are kept,
  // migrated to open via the Transport drawer; the two nudge-driven
  // date-update-flow tests were dropped rather than migrated because
  // TransportDrawer deliberately never passes onAddDates (see its own
  // comment) — the nudge button doesn't render in the drawer by design,
  // Set-dates being leg-level and already inline on the Itinerary item.
  describe('flight live-offer card (TWM-146), via the Transport drawer', () => {
    async function openDrawer() {
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      return user;
    }

    it('renders a specific clarification prompt (not a generic error) when flight-search needs more info', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = defaultFetchMock(); // flight-search defaults to clarification_needed
      await openDrawer();
      await waitFor(() => expect(screen.getAllByText(/Tell us your exact route to search live prices\./).length).toBeGreaterThan(0));
    });

    it('renders live-offer price/airline/stops distinctly from the plain redirect-only cards, and still keeps the CTA link separate', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
        if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
        if (url.includes('/flight-search')) {
          return jsonResponse({
            status: 'offer',
            queried_at: '2026-01-01T00:00:00.000Z',
            date_precision: 'exact',
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
      await openDrawer();

      // TWM-196 UX review: the Aviasales Data API is a cached lookup,
      // never a confirmed-availability check, so the primary offer block
      // reads "Cached price", not "Live offer".
      await waitFor(() => expect(screen.getAllByText('Cached price').length).toBeGreaterThan(0));
      expect(screen.getAllByText(/approx\. INR 8,?000\.00/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/IndiGo/).length).toBeGreaterThan(0);
      // The trusted-action CTA (Aviasales redirect) is still present and
      // separate from the offer data block — the offer itself carries no
      // url.
      expect(document.querySelector('a[href*="aviasales"]')).not.toBeNull();
      // TWM-196: the affiliate CTA names the actual Backend-resolved
      // partner rather than a generic "Search flights" label, so it's
      // never confused with the TWM-resolved offer block above it.
      expect(screen.getAllByText('Check availability on Aviasales ↗').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/confirm the real fare and availability on Aviasales/).length).toBeGreaterThan(0);
    });

    // TWM-206: regression guard for the origin bug this story's discovery
    // started from -- pickPrimaryOffer used to discard every ranked
    // offer but one before it ever reached the card.
    it('renders every ranked flight offer, not just the recommended one', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
        if (url.includes('/flight-search')) {
          return jsonResponse({
            status: 'offer',
            queried_at: '2026-01-01T00:00:00.000Z',
            date_precision: 'exact',
            offers: [
              {
                origin_iata: 'DEL', destination_iata: 'DED', trip_type: 'round_trip',
                departure_date: '2026-03-01', return_date: '2026-03-05',
                money: { currency: 'INR', per_traveler_amount_minor_units: 400000, traveler_count: 2, group_total_minor_units: 800000, group_total_is_approximate: true },
                baggage: {}, fare_conditions: {}, provenance: { provider_name: 'aviasales', provider_reference: 'ref-1' },
                price_found_at: '2026-01-01T00:00:00.000Z', airline_name: 'IndiGo', stop_count: 0, is_recommended: true,
              },
              {
                origin_iata: 'DEL', destination_iata: 'DED', trip_type: 'round_trip',
                departure_date: '2026-03-01', return_date: '2026-03-05',
                money: { currency: 'INR', per_traveler_amount_minor_units: 600000, traveler_count: 2, group_total_minor_units: 1200000, group_total_is_approximate: true },
                baggage: {}, fare_conditions: {}, provenance: { provider_name: 'aviasales', provider_reference: 'ref-2' },
                price_found_at: '2026-01-01T00:00:00.000Z', airline_name: 'Air India', stop_count: 1, is_recommended: false,
              },
            ],
          });
        }
        return jsonResponse({});
      });
      await openDrawer();

      await waitFor(() => expect(screen.getAllByText(/approx\. INR 8,?000\.00/).length).toBeGreaterThan(0));
      // The second, non-recommended offer is not discarded.
      expect(screen.getAllByText(/approx\. INR 12,?000\.00/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Air India/)).toBeInTheDocument();
      expect(screen.getAllByText('Our pick').length).toBeGreaterThan(0);
    });

    it('captions the affiliate CTA as "no TWM-resolved price" when live search has no offer to show', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
        if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
        if (url.includes('/flight-search')) {
          return jsonResponse({
            status: 'unavailable',
            queried_at: '2026-01-01T00:00:00.000Z',
            unavailable: { code: 'provider_not_configured', message: 'Live flight search is not available yet for this trip.' },
          });
        }
        return jsonResponse({});
      });
      await openDrawer();

      await waitFor(() => expect(screen.getAllByText('Check availability on Aviasales ↗').length).toBeGreaterThan(0));
      expect(screen.getAllByText(/No TWM-resolved price yet — search directly on Aviasales/).length).toBeGreaterThan(0);
    });

    it('renders the Backend-authored unavailable message safely for a flight card', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
        if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
        if (url.includes('/flight-search')) {
          return jsonResponse({ status: 'unavailable', queried_at: '2026-01-01T00:00:00.000Z', unavailable: { code: 'provider_timeout', message: 'The flight provider timed out — try again shortly.' } });
        }
        return jsonResponse({});
      });
      await openDrawer();
      await waitFor(() => expect(screen.getAllByText(/The flight provider timed out — try again shortly\./).length).toBeGreaterThan(0));
    });

    it('does not render an affiliate-disclosure line even when the resolved trusted action carries one', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      await openDrawer();
      await waitFor(() => expect(screen.getAllByRole('link', { name: /↗/ }).length).toBeGreaterThan(0));
      expect(screen.queryByText(/This is an affiliate link/)).toBeNull();
    });

    it('shows an inert note, no broken link, when a trusted action resolves to missing_input', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const flightOnlyAssessment = {
        modes: [{ mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'Fastest option.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } }],
      };
      global.fetch = vi.fn(async url => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, flightOnlyAssessment));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(flightOnlyAssessment);
        if (url.includes('/trusted-action')) return jsonResponse({ status: 'missing_input', generated_at: '2026-01-01T00:00:00.000Z', missing_input: { missing_fields: ['origin'], message: 'Tell us the missing details.' } });
        return jsonResponse({});
      });
      await openDrawer();
      await waitFor(() => expect(screen.getAllByText(/Flight/).length).toBeGreaterThan(0));
      expect(document.querySelector('a[href*="ixigo"]')).toBeNull();
    });
  });

  // TWM-213: the structured, Backend-owned trip_context.traveler_composition
  // (never the loose conversational num_travelers) is the traveler-count
  // source for transport CTA payloads. Migrated (TWM-206) to resolve via
  // the Transport drawer instead of the retired Bookings tab.
  it('derives traveler_count from canonical trip_context composition for transport CTA payloads', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi', traveler_composition: { adults: 2, children: 1, infants: 0 } } });
    sendTripCommand = vi.fn();
    let capturedBodies = [];
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
      if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
      if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
      if (url.includes('/trusted-action')) { capturedBodies.push(JSON.parse(options.body)); return jsonResponse(resolvedActionResponse()); }
      if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
      return jsonResponse({});
    });
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Itinerary/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Transport options/ }));
    await waitFor(() => expect(capturedBodies.length).toBeGreaterThan(0));
    expect(capturedBodies.some(body => body.traveler_count === 3)).toBe(true);
  });

  // TWM-198: the self-confirm-yourself flow (fieldless "mark as booked"
  // via confirm_logistics with placeholder detail) is removed from
  // Bookings MVP entirely -- confirm_logistics requires a genuine,
  // mandatory non-empty detail and triggers a full itinerary revision
  // proposal, so it is never a lightweight toggle Bookings MVP should
  // fake its way into calling. Migrated (TWM-206) off the retired Bookings
  // tab onto the Itinerary/Transport-drawer surface.
  it('never shows "Add a confirmation" or calls confirm_logistics from a transport/stay/activity row', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Itinerary/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Transport options/ }));

    expect(screen.queryByText('Add a confirmation →')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Details')).not.toBeInTheDocument();
    expect(sendTripCommand).not.toHaveBeenCalledWith('confirm_logistics', expect.anything());
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

  // TWM-198: a confirmed anchor whose day_number no longer exists in the
  // current itinerary (regeneration changed the day count) must not become
  // silently invisible now that the Bookings tab's generic orphan-anchor
  // catch-all is gone — Overview surfaces it under "Other confirmed items".
  it('shows an orphaned anchor (day_number no longer in the itinerary) under "Other confirmed items" on Overview', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), {
      anchors: [anchor({ day_number: 99, label: 'Old riverside stay', detail: 'Riverside Cottage, ₹4,200/night' })],
    });
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getByText('Other confirmed items')).toBeInTheDocument();
    expect(screen.getByText('Old riverside stay')).toBeInTheDocument();
    expect(screen.getByText('Riverside Cottage, ₹4,200/night')).toBeInTheDocument();
  });

  it('does not show "Other confirmed items" when every anchor still matches a current day', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { anchors: [anchor({ day_number: 2, label: 'Riverside stay' })] });
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.queryByText('Other confirmed items')).not.toBeInTheDocument();
  });

  // TWM-175: the Map tab is gone — it was never a real map, just route
  // order, which now folds into Overview's day-strip instead.
  it('shows all 3 tabs, never the old Stays/Transport/Map/Docs/Bookings ones', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    for (const name of ['Overview', 'Itinerary', 'Support']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /Stays/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Transport/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Map/ })).not.toBeInTheDocument();
    // TWM-206: Bookings retired — Transport/Stay resolution and Set-dates
    // now live inline on the Itinerary item itself.
    expect(screen.queryByRole('button', { name: /Bookings/ })).not.toBeInTheDocument();
    // TWM-198: Docs was a permanent "Coming soon" placeholder with no
    // real content behind it -- removed rather than shipped fake.
    expect(screen.queryByRole('button', { name: /Docs/ })).not.toBeInTheDocument();
  });

  // TWM-206 step 2: Set-dates moves inline onto the Itinerary item itself
  // (leg-level, never inside a drawer) — only a gateway TRAVEL leg
  // (is_gateway_leg from the Trip Board adapter) gets the affordance.
  // PR review, TWM-206: boardData resolves asynchronously and can lag one
  // render behind a just-landed itineraryResult revision — a stale board
  // response (still describing the previous version) must never be
  // index-matched against the new timeline, since a changed item order/
  // count could silently attach the wrong gateway-leg affordance to the
  // wrong item. Falls back to no board-derived affordances (Set-dates/
  // Transport-options) until boardData.version actually matches.
  it('renders no Set-dates/Transport-options affordance from a stale board response whose version does not match the current itinerary', async () => {
    commandSnapshot = snapshotWith(readyItineraryState({ version: 2 }), {}, { trip_context: { origin_city: 'Delhi' } });
    itineraryFetchResponse = { version: 2, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z', result: atlasResult() };
    sendTripCommand = vi.fn();
    // The /board mock always reports version 1 (stale), regardless of the
    // itinerary body already being on version 2.
    global.fetch = vi.fn(async url => {
      if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
      if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
      if (url.includes('/board')) {
        const stale = boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse());
        return jsonResponse({ ...stale, version: 1 });
      }
      if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
      return jsonResponse({});
    });
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Itinerary/ }));

    // Day 1's "Arrival from Delhi" is a real gateway leg, but the board
    // response describing it is stale — no affordance should render.
    await waitFor(() => expect(screen.getByText('Arrival from Delhi')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Set dates/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Transport options/ })).not.toBeInTheDocument();
  });

  // TWM-213 UX rework: trip dates and traveler composition are edited from
  // a single shared summary strip at the top of the Transport/Stay drawer
  // (wherever the search actually happens), not inline on the Itinerary
  // item — both are trip-wide facts, never leg- or stay-specific.
  describe('Booking summary strip — trip dates and travelers (TWM-213)', () => {
    it('shows "Set trip dates" and "Set trip travelers" inside the Transport drawer when neither is known yet', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      // Atlas's own resolved num_travelers is now a valid fallback source
      // (see the TripHero/booking-strip approximation tests below) — this
      // test is specifically the "genuinely nothing known anywhere" case,
      // so it must override the default fixture's num_travelers: 2.
      itineraryFetchResponse = {
        version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: null, date_range: null, overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } }),
      };
      global.fetch = defaultFetchMock();
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));

      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      expect(within(drawer).getByRole('button', { name: /Set trip dates/ })).toBeInTheDocument();
      expect(within(drawer).getByRole('button', { name: /Set trip travelers/ })).toBeInTheDocument();
    });

    it('expands the date-edit form inline in the drawer, saves via update_booking_dates, and reflects the saved date on the button', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('update_booking_dates');
        expect(payload.bookingDateUpdate).toEqual({ departure_date: '2026-05-01' });
        commandSnapshot = snapshotWith(
          readyItineraryState(),
          {},
          { trip_context: { origin_city: 'Delhi', booking_dates: { precision: 'exact', departure_date: '2026-05-01' } } },
        );
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });

      await user.click(within(drawer).getByRole('button', { name: /Set trip dates/ }));
      expect(within(drawer).getByLabelText('Departure date')).toBeInTheDocument();

      await user.type(within(drawer).getByLabelText('Departure date'), '2026-05-01');
      await user.click(within(drawer).getByRole('button', { name: 'Save dates' }));

      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('update_booking_dates', expect.anything()));
      await waitFor(() => expect(within(drawer).getByRole('button', { name: /Trip dates: 2026-05-01 · Change/ })).toBeInTheDocument());
    });

    // TWM-215 live-testing finding: the exact/month radio choice used to
    // render every time, even when a precision was already on file --
    // confusing when a traveler who already said "I only know the month"
    // opened "Change" to narrow down an exact date, since it re-asked the
    // exact/month question from scratch instead of taking that as given.
    it('narrows a known month to an exact date without re-showing the exact/month choice, but still offers "Change month"', async () => {
      commandSnapshot = snapshotWith(
        readyItineraryState(),
        {},
        { trip_context: { origin_city: 'Delhi', booking_dates: { precision: 'month', departure_month: '2026-05' } } },
      );
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });

      await user.click(within(drawer).getByRole('button', { name: /Trip dates: 2026-05 · Change/ }));
      expect(within(drawer).queryByRole('radiogroup', { name: 'Date precision' })).not.toBeInTheDocument();
      expect(within(drawer).getByLabelText('Departure date')).toBeInTheDocument();
      expect(within(drawer).getByRole('button', { name: /Not in this month\? Change month/ })).toBeInTheDocument();

      // The escape hatch genuinely re-opens the mode choice.
      await user.click(within(drawer).getByRole('button', { name: /Not in this month\? Change month/ }));
      expect(within(drawer).getByRole('radiogroup', { name: 'Date precision' })).toBeInTheDocument();
    });

    // PR review, TWM-206 (still applies post-TWM-213): "Change" already
    // advertises the saved value on its own face -- it must open
    // pre-filled with that value, not blank, or a traveler adding just a
    // return date has to retype the departure date from memory before
    // Save unlocks.
    it('seeds "Change" with the already-saved date instead of opening blank', async () => {
      commandSnapshot = snapshotWith(
        readyItineraryState(),
        {},
        { trip_context: { origin_city: 'Delhi', booking_dates: { precision: 'exact', departure_date: '2026-05-01' } } },
      );
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });

      await waitFor(() => expect(within(drawer).getByRole('button', { name: /Trip dates: 2026-05-01 · Change/ })).toBeInTheDocument());
      await user.click(within(drawer).getByRole('button', { name: /Trip dates: 2026-05-01 · Change/ }));
      expect(within(drawer).getByLabelText('Departure date')).toHaveValue('2026-05-01');
      expect(within(drawer).getByRole('button', { name: 'Save dates' })).not.toBeDisabled();
    });

    // PR review, TWM-213: booking_dates carries both departure_date and
    // return_date -- the Board resolves the inbound gateway leg's own date
    // to return_date, not departure_date (twm/services/trip_board/
    // service.py's is_outbound/is_inbound branch). The strip must reflect
    // whichever this specific drawer's search will actually use, or it
    // silently shows the outbound date while searching with the return one.
    it('shows the return date, not the departure date, on the inbound gateway leg\'s drawer', async () => {
      commandSnapshot = snapshotWith(
        readyItineraryState(),
        {},
        { trip_context: { origin_city: 'Delhi', booking_dates: { precision: 'exact', departure_date: '2026-05-01', return_date: '2026-05-05' } } },
      );
      sendTripCommand = vi.fn();
      global.fetch = defaultFetchMock();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      const dayNav = screen.getByRole('navigation', { name: 'Select a day' });
      await user.click(within(dayNav).getByText('2'));

      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Rishikesh to Delhi/ });

      expect(within(drawer).getByRole('button', { name: /Trip dates: 2026-05-05 · Change/ })).toBeInTheDocument();
    });

    it('saves traveler composition via update_traveler_composition from the drawer and reflects it on the button', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      // Same "genuinely nothing known yet" override as the test above, so
      // the button starts as "Set trip travelers" rather than Atlas's
      // resolved-approximation label.
      itineraryFetchResponse = {
        version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: null, date_range: null, overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } }),
      };
      global.fetch = defaultFetchMock();
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('update_traveler_composition');
        // Form defaults are adults: 1, children: 0, infants: 0 (the "just
        // me" case) — submitting without touching any field still exercises
        // the full save/reflect wiring without fighting jsdom's quirks
        // around controlled number-input edits.
        expect(payload.travelerCompositionUpdate).toEqual({ adults: 1, children: 0, infants: 0 });
        commandSnapshot = snapshotWith(
          readyItineraryState(),
          {},
          { trip_context: { origin_city: 'Delhi', traveler_composition: { adults: 1, children: 0, infants: 0 } } },
        );
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });

      await user.click(within(drawer).getByRole('button', { name: /Set trip travelers/ }));
      await user.click(within(drawer).getByRole('button', { name: 'Save travelers' }));

      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('update_traveler_composition', expect.anything()));
      await waitFor(() => expect(within(drawer).getByRole('button', { name: /Trip 1 travelers · Change/ })).toBeInTheDocument());
    });
  });

  // TWM-206 step 3: Transport is information-dense, so it opens a side
  // drawer instead of expanding inline — dims the Itinerary behind it,
  // never a full-screen modal, never a date-input control of its own.
  describe('Itinerary Transport drawer (TWM-206)', () => {
    it('opens a drawer for the clicked gateway leg, resolves and shows feasible-mode options, and lists other modes collapsed', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));

      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      // Backend's feasibleAssessmentResponse fixture (used by the shared
      // /board mock) returns all four modes feasible for this leg.
      await waitFor(() => expect(within(drawer).getAllByText(/Flight|Train|Bus|Drive/).length).toBeGreaterThan(0));
      // TWM-213: the date-input form is collapsed by default, only
      // expanding once the "Set trip dates" trigger is clicked.
      expect(within(drawer).queryByLabelText('Departure date')).toBeNull();
      expect(within(drawer).getByRole('button', { name: /Set trip dates/ })).toBeInTheDocument();
      // Every mode was feasible for this fixture, so there's nothing left
      // to list in the collapsed "other modes" section.
      expect(within(drawer).queryByText(/not available for this route/i)).toBeNull();
    });

    it('lists only the genuinely infeasible modes in the collapsed section, never mixed into the primary options', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const busOnlyAssessment = {
        modes: [{ mode: 'bus', status: 'feasible', duration_source: 'computed', reason: 'Practical for this trip.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } }],
      };
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, busOnlyAssessment));
        if (url.includes('/trusted-action')) return jsonResponse(resolvedActionResponse());
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));

      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      await waitFor(() => expect(within(drawer).getByText('3 not available for this route', { exact: false })).toBeInTheDocument());
      // Flight/train/drive are collapsed as not feasible; bus is the only
      // primary, actionable option. Click the summary specifically (its
      // count text is distinct from each item's own "Not available for
      // this route." line) to expand, then confirm exactly the 3.
      await user.click(within(drawer).getByText('3 not available for this route', { exact: false }));
      expect(within(drawer).getAllByText('Not available for this route.').length).toBe(3);
    });

    it('closes on the close button and on clicking the dimmed overlay', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const closeButton = await screen.findByRole('button', { name: 'Close transport options' });
      await user.click(closeButton);
      expect(screen.queryByRole('dialog', { name: /Delhi to Rishikesh/ })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      await user.click(document.querySelector('.transport-drawer-overlay'));
      expect(screen.queryByRole('dialog', { name: /Delhi to Rishikesh/ })).not.toBeInTheDocument();
    });

    // PR review, TWM-206: legKey has no date component, so a Transport
    // drawer entry cached before a date was set must not keep serving
    // those (flexible-precision) options forever after Set-dates saves an
    // exact date for the same leg — the whole point of wiring Set-dates
    // into the drawer's date-prefill is that a later open reflects it.
    it('refetches transport options after a booking-date save invalidates the drawer cache', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      let trustedActionCallCount = 0;
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('update_booking_dates');
        expect(payload.bookingDateUpdate).toEqual({ departure_date: '2026-05-01' });
        commandSnapshot = snapshotWith(
          readyItineraryState(),
          {},
          { trip_context: { origin_city: 'Delhi', booking_dates: { precision: 'exact', departure_date: '2026-05-01' } } },
        );
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action')) { trustedActionCallCount += 1; return jsonResponse(resolvedActionResponse()); }
        if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      let drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      await waitFor(() => expect(trustedActionCallCount).toBeGreaterThan(0));
      const callCountBeforeDateSave = trustedActionCallCount;
      await user.click(within(drawer).getByRole('button', { name: 'Close transport options' }));

      // TWM-213: Set-dates now lives inside the drawer's summary strip —
      // reopen it to set the date, same as a traveler would.
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      await user.click(within(drawer).getByRole('button', { name: /Set trip dates/ }));
      await user.type(within(drawer).getByLabelText('Departure date'), '2026-05-01');
      await user.click(within(drawer).getByRole('button', { name: 'Save dates' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('update_booking_dates', expect.anything()));
      await user.click(within(drawer).getByRole('button', { name: 'Close transport options' }));

      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      // A real refetch happened — the stale cached entry from before the
      // date save was not reused.
      await waitFor(() => expect(trustedActionCallCount).toBeGreaterThan(callCountBeforeDateSave));
    });

    // TWM-215: a search-scoped traveler-count override (e.g. only 3 of 4
    // travelers are on this specific gateway leg) must fetch independently
    // of the trip-wide default, and must never write traveler_composition
    // back to trip_context — it only changes what this one search asks for.
    it('re-searches transport options for an overridden traveler count without touching traveler_composition', async () => {
      commandSnapshot = snapshotWith(
        readyItineraryState(),
        {},
        { trip_context: { origin_city: 'Delhi', traveler_composition: { adults: 4, children: 0, infants: 0 } } },
      );
      sendTripCommand = vi.fn();
      let trustedActionCallCount = 0;
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action')) { trustedActionCallCount += 1; return jsonResponse(resolvedActionResponse()); }
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      await waitFor(() => expect(trustedActionCallCount).toBeGreaterThan(0));
      const callCountForDefault = trustedActionCallCount;

      const countInput = within(drawer).getByRole('spinbutton');
      expect(countInput).toHaveValue(4);
      await user.clear(countInput);
      await user.type(countInput, '3');
      await user.click(within(drawer).getByRole('button', { name: 'Search' }));

      await waitFor(() => expect(trustedActionCallCount).toBeGreaterThan(callCountForDefault));
      expect(within(drawer).getByRole('button', { name: /Reset to 4 default/ })).toBeInTheDocument();
      // This is a search-only override -- it never sends a trip command.
      expect(sendTripCommand).not.toHaveBeenCalled();
    });

  });

  // TWM-206/TWM-211: Stay opens the same density-driven drawer pattern as
  // Transport, but the trigger now belongs to the actual STAY timeline item
  // so its city cannot drift from the overnight stay.
  describe('Itinerary Stay drawer (TWM-206/TWM-211)', () => {
    it('opens a drawer for the day\'s base, resolves and shows every approved partner as a link-only card', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Stay options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Stay options/ }));

      const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
      await waitFor(() => expect(within(drawer).getAllByText('Check stay ↗').length).toBe(3));
      expect(within(drawer).getByText('Rishikesh · 2 nights')).toBeInTheDocument();
      expect(within(drawer).getByText('Rishikesh — Hotellook')).toBeInTheDocument();
      expect(within(drawer).getByText('Rishikesh — Booking.com')).toBeInTheDocument();
      expect(within(drawer).getByText('Rishikesh — Agoda')).toBeInTheDocument();
    });

    it('opens from the STAY timeline item city when the overnight city differs from the day primary location', async () => {
      const base = atlasResult();
      itineraryFetchResponse = {
        version: 1,
        source_guide_revision: 3,
        created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({
          final_itinerary: {
            trip_summary: {
              ...base.final_itinerary.trip_summary,
              destinations: ['Rishikesh', 'Agra', 'Jaipur'],
              duration_days: 2,
            },
            days: [
              base.final_itinerary.days[0],
              {
                ...base.final_itinerary.days[1],
                title: 'Agra sights, Jaipur overnight',
                primary_location: 'Agra',
                summary: 'Spend the day in Agra, then continue to Jaipur for the night.',
                timeline: [
                  {
                    start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Taj Mahal visit', location: 'Agra',
                    detail: 'Visit the Taj Mahal before the onward drive.', movement_guidance: null, estimated_cost_low: 0, estimated_cost_high: 0,
                    reference: generalReference(), requires_advance_booking: false, booking_readiness: null,
                  },
                  {
                    start_time: 'Night', end_time: null, kind: 'STAY', title: 'Overnight in Jaipur', location: 'Jaipur',
                    detail: 'Check into a Jaipur hotel after the Agra day.', movement_guidance: null, estimated_cost_low: 2400, estimated_cost_high: 5200,
                    reference: generalReference(), requires_advance_booking: true, booking_readiness: 'needs_advance_booking',
                  },
                ],
              },
            ],
          },
        }),
      };
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const capturedBodies = [];
      global.fetch = vi.fn(async (url, options) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state?.trip_context, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action')) {
          capturedBodies.push(JSON.parse(options.body));
          return jsonResponse(resolvedActionResponse());
        }
        if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await user.click(within(screen.getByRole('navigation', { name: 'Select a day' })).getByRole('button', { name: /Day 2/ }));

      const stayTimelineItem = screen.getByText('Overnight in Jaipur').closest('.atlas-item');
      expect(stayTimelineItem).not.toBeNull();
      await user.click(within(stayTimelineItem).getByRole('button', { name: /Stay options/ }));

      const drawer = await screen.findByRole('dialog', { name: /Stay: Jaipur/ });
      await waitFor(() => expect(within(drawer).getAllByText('Check stay ↗').length).toBe(3));
      expect(within(drawer).getByText('Jaipur · 1 night')).toBeInTheDocument();
      expect(within(drawer).getByText('Jaipur — Hotellook')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /Stay: Agra/ })).not.toBeInTheDocument();
      expect(capturedBodies).toHaveLength(3);
      expect(capturedBodies.every(body => body.domain === 'stay' && body.destination === 'Jaipur')).toBe(true);
    });

    it('shows the non-binding tiered estimate when Atlas provides one on the stay\'s first day', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      itineraryFetchResponse = {
        version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({
          final_itinerary: {
            days: [
              {
                ...atlasResult().final_itinerary.days[0],
                stay_price_estimate: [
                  { tier: 'budget', estimated_cost_low: 1000, estimated_cost_high: 2000 },
                  { tier: 'mid_range', estimated_cost_low: 2500, estimated_cost_high: 5000 },
                  { tier: 'premium', estimated_cost_low: 6000, estimated_cost_high: 12000 },
                ],
              },
              atlasResult().final_itinerary.days[1],
            ],
          },
        }),
      };
      global.fetch = defaultFetchMock();
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Stay options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Stay options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
      expect(within(drawer).getByText('Non-binding estimate, per night')).toBeInTheDocument();
      expect(within(drawer).getByText('Budget')).toBeInTheDocument();
      expect(within(drawer).getByText('₹1,000–₹2,000')).toBeInTheDocument();
      expect(within(drawer).getByText('Premium')).toBeInTheDocument();
    });

    it('shows no estimate section when Atlas has not provided one for the stay', async () => {
      // Default readyItineraryState() fixture carries no stay_price_estimate
      // on either day.
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Stay options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Stay options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
      await waitFor(() => expect(within(drawer).getAllByText('Check stay ↗').length).toBe(3));
      expect(within(drawer).queryByText('Non-binding estimate, per night')).toBeNull();
    });

    // PR review, TWM-206: the three stay partners are functionally
    // equivalent link-only redirects with no price/rating behind them —
    // picking the first-resolved one as "Our pick" would be exactly the
    // fabricated ranking indicator this drawer's own comment disclaims.
    it('never shows an "Our pick" badge on a stay partner card', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Stay options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Stay options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
      await waitFor(() => expect(within(drawer).getAllByText('Check stay ↗').length).toBe(3));
      expect(within(drawer).queryByText('Our pick')).not.toBeInTheDocument();
    });
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
    commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { booking_dates: { precision: 'exact', departure_date: '2026-10-12' } } });
    sendTripCommand = vi.fn();
    const base = atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 2, date_range: 'October', overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } });
    itineraryFetchResponse = { version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z', result: base };
    global.fetch = defaultFetchMock();
    await readyDashboard();
    await waitFor(() => expect(screen.getAllByText('2026-10-12 – 2026-10-13').length).toBeGreaterThan(0));
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
  it('displays the canonical traveler_composition total, not the loose num_travelers or Atlas summary fallback', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { num_travelers: 'a family of 5', traveler_composition: { adults: 2, children: 2, infants: 1 } } });
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 9, date_range: null, overview: 'x', route_rationale: 'y' } } }),
    };
    global.fetch = defaultFetchMock();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('9').filter(el => el.closest('.hero-stats'))).toHaveLength(0);
  });

  // TWM-215 live-testing finding, superseding the prior "never guess from
  // Atlas summary" rule this test used to assert: Atlas already resolves a
  // qualitative num_travelers answer (e.g. "couple") into a real number and
  // records the assumption transparently — hiding that resolved number
  // behind "Not set" was the actual bug (a genuinely-known rough fact
  // looked like nothing was known), not a safety net. Once composition is
  // unset, Atlas's trip_summary.num_travelers is now the honest fallback,
  // shown explicitly as an approximation rather than "Not set".
  it('shows Atlas\'s resolved num_travelers as an approximation when traveler_composition is unset, not "Not set"', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: {} });
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 5, date_range: null, overview: 'x', route_rationale: 'y' } } }),
    };
    global.fetch = defaultFetchMock();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('~5').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Not set').filter(el => el.closest('.hero-stats'))).toHaveLength(0);
  });

  // Genuinely nothing known anywhere (no composition, no trip_context
  // num_travelers, and Atlas itself has no resolved count) is the only case
  // that should still say "Not set".
  it('honestly shows traveler count as not set only when Atlas has no resolved num_travelers either', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: {} });
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: null, date_range: null, overview: 'x', route_rationale: 'y' } } }),
    };
    global.fetch = defaultFetchMock();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0);
  });

  it('trust strip is visible without any user action — no closed-by-default disclosure', async () => {
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

  it('renders day-specific Atlas notes from the canonical notes list', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();

    await user.click(screen.getByRole('button', { name: /Itinerary/ }));

    expect(screen.getByText('Carry layers')).toBeInTheDocument();
    expect(screen.getByText(/Carry layers\./)).toBeInTheDocument();
    expect(screen.getByText('No permits')).toBeInTheDocument();
    expect(screen.getByText(/None required\./)).toBeInTheDocument();
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
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // TWM-206: Bookings retired — "sort out bookings now" lands on
      // Itinerary, where Transport/Stay resolution now actually lives.
      expect(screen.getByRole('button', { name: /Itinerary/ })).toHaveClass('active');
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const tabs = await screen.findByRole('navigation', { name: 'Trip Dashboard tabs' });
      expect(within(tabs).getByText('Overview')).toBeInTheDocument();
      expect(within(tabs).getByText('Itinerary')).toBeInTheDocument();
      expect(within(tabs).getByText('Support')).toBeInTheDocument();
      expect(within(tabs).queryByText('Docs')).not.toBeInTheDocument();
      expect(within(tabs).queryByText('Bookings')).not.toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(within(tabs).getByText('Support'));

      expect(screen.getByText('Available once your itinerary is ready.')).toBeInTheDocument();
      expect(screen.queryByText('Your trip so far')).not.toBeInTheDocument();
    });

    // TWM-184: there was previously no way back from a per-trip Dashboard to
    // the trips list at all — confirmed absent via grep before this fix.
    it('shows a "Back to your trips" link pointing at Home', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const link = await screen.findByRole('link', { name: '← Back to your trips' });
      expect(link).toHaveAttribute('href', '/');
    });

    it('shows budget as a row in "Your trip so far" when present, and omits it when absent', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi', budget: '₹1,00,000 total for both' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
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
        trip_state: { stage: 'recommended', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {}, logistics_state: { anchors: [] } },
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
          trip_context: { origin_city: 'Delhi', destinations: ['Udaipur'] },
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
