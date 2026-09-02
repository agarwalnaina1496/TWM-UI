import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripDashboard from '../../../src/pages/TripDashboard.jsx';
import { transportLegs, gatewayLegs } from '../../../src/lib/bookingCatalog.js';
import { tripOriginCity } from '../../../src/constants/tripContext.js';
import { bookingSetupStart, bookingSetupSearchPref } from '../../../src/constants/bookingSetup.js';

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
function readyItineraryState({ version = 1, history = [] } = {}) {
  return {
    status: 'ready',
    current_version: { version, source_guide_revision: 3 },
    history,
  };
}

// TWM-175: Atlas rejects start_itinerary unless a plan is actually frozen —
// every fixture below is exercising the post-approval Atlas contract, so
// frozen_plan defaults present here (a dedicated thin-state describe block
// below covers the pre-frozen case explicitly).
function snapshotWith(itineraryState, { plannerState, bookingSetup } = {}, { trip_context: tripContext = {} } = {}) {
  return {
    id: 'trip-1',
    version: 1,
    trip_state: {
      stage: 'planned',
      trip_context: tripContext,
      planner_state: plannerState ?? { frozen_plan: { guide_revision: 3, guide_state: {} } },
      itinerary_state: itineraryState,
      ...(bookingSetup ? { booking_setup: bookingSetup } : {}),
    },
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
function resolvedActionResponse({
  affiliate = true,
  partner = 'aviasales',
  url = 'https://www.aviasales.com/search',
  capability = 'prefilled_search',
  ctaLabel = 'Search options',
  capabilityNote = 'Search opens on the selected provider.',
} = {}) {
  return {
    status: 'resolved',
    generated_at: '2026-01-01T00:00:00.000Z',
    action: {
      action_type: 'SEARCH_REDIRECT', domain: 'flight',
      target: { partner, path: 'search', query_params: {}, target_url: url },
      internal_capability: null, affiliate_disclosure: affiliate,
      capability, cta_label: ctaLabel, capability_note: capabilityNote,
      generated_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

function stayActionResponse(partner) {
  if (partner === 'booking_com') {
    return resolvedActionResponse({
      affiliate: false,
      partner,
      url: 'https://www.booking.com/searchresults.html?ss=Rishikesh',
      capability: 'destination_search',
      ctaLabel: 'Search Booking.com',
      capabilityNote: 'Destination search opens on Booking.com; choose exact dates there if needed.',
    });
  }
  if (partner === 'agoda') {
    return resolvedActionResponse({
      affiliate: false,
      partner,
      url: 'https://www.agoda.com/search?city=11304',
      capability: 'known_destination_search',
      ctaLabel: 'Search Agoda',
      capabilityNote: 'Known Agoda city metadata opens the correct destination search.',
    });
  }
  return resolvedActionResponse({
    affiliate: false,
    partner: 'ixigo',
    url: 'https://www.ixigo.com/hotels/hotels-in-rishikesh',
    capability: 'destination_redirect',
    ctaLabel: 'Browse ixigo hotels',
    capabilityNote: 'ixigo opens the destination hotel page.',
  });
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
function boardResponseFor(itineraryResult, tripState, feasibility = feasibleAssessmentResponse()) {
  const days = itineraryResult.result.final_itinerary.days;
  const originCity = tripOriginCity(tripState?.trip_context);
  const start = bookingSetupStart(tripState);
  const startDate = start?.precision === 'exact' ? start.date : null;
  const startMonth = start?.precision === 'month' ? start.month : null;
  const allLegs = transportLegs(days);
  const gatewayKeys = new Set(gatewayLegs(allLegs, originCity).map(leg => `${leg.from}→${leg.to}`));
  const legByKey = Object.fromEntries(allLegs.map(leg => [`${leg.from}→${leg.to}`, leg]));
  const addDays = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const dayDate = n => (startDate ? addDays(startDate, n - 1) : null);
  const boardDays = days.map(day => ({
    ...day,
    date: dayDate(day.day_number),
    items: day.timeline.map((item, index) => {
      const id = `test-trip:${day.day_number}:${index}`;
      if (item.kind !== 'TRAVEL' || !item.from_city || !item.to_city) {
        return { ...item, id, is_gateway_leg: false, feasible_modes: null, date_precision: null, date_source: null };
      }
      const key = `${item.from_city}→${item.to_city}`;
      const isGateway = gatewayKeys.has(key);
      const leg = legByKey[key] || {};
      const override = bookingSetupSearchPref(tripState, 'transport', id);
      let departure_date = null, departure_month = null, date_precision = 'flexible', date_source = 'none';
      if (leg.departureDate) { departure_date = leg.departureDate; date_precision = 'exact'; date_source = 'itinerary'; }
      else if (leg.departureMonth) { departure_month = leg.departureMonth; date_precision = 'month'; date_source = 'itinerary'; }
      else if (override?.precision === 'exact') { departure_date = override.date; date_precision = 'exact'; date_source = 'override'; }
      else if (override?.precision === 'month') { departure_month = override.month; date_precision = 'month'; date_source = 'override'; }
      else if (dayDate(day.day_number)) { departure_date = dayDate(day.day_number); date_precision = 'exact'; date_source = 'anchor'; }
      else if (startMonth) { departure_month = startMonth; date_precision = 'month'; date_source = 'anchor'; }
      return {
        ...item, id,
        is_gateway_leg: isGateway,
        feasible_modes: isGateway ? (feasibility?.modes || []) : null,
        date_precision, departure_date, departure_month, date_source,
      };
    }),
  }));
  const staySegments = [];
  let current = null;
  for (const day of boardDays) {
    for (const item of day.items.filter(entry => entry.kind === 'STAY')) {
      if (current && current.location === item.location && day.day_number === current.end_day_number + 1) {
        current.end_day_number = day.day_number;
        current.board_item_ids.push(item.id);
        continue;
      }
      if (current) staySegments.push(current);
      current = {
        location: item.location,
        start_day_number: day.day_number,
        end_day_number: day.day_number,
        board_item_ids: [item.id],
      };
    }
  }
  if (current) staySegments.push(current);
  const finalizedStaySegments = staySegments.map(segment => {
    const nights = segment.end_day_number - segment.start_day_number + 1;
    const id = `test-trip:stay:${segment.start_day_number}:${segment.end_day_number}:${String(segment.location).toLowerCase().replace(/\s+/g, '-')}`;
    const override = bookingSetupSearchPref(tripState, 'stay', id);
    const anchoredCheckin = dayDate(segment.start_day_number);
    let checkin_date = null, checkout_date = null, departure_month = null, date_precision = 'flexible', date_source = 'none';
    if (override?.precision === 'exact') {
      checkin_date = override.date; checkout_date = addDays(override.date, nights);
      date_precision = 'exact'; date_source = 'override';
    } else if (override?.precision === 'month') {
      departure_month = override.month; date_precision = 'month'; date_source = 'override';
    } else if (anchoredCheckin) {
      checkin_date = anchoredCheckin; checkout_date = addDays(anchoredCheckin, nights);
      date_precision = 'exact'; date_source = 'anchor';
    } else if (startMonth) {
      departure_month = startMonth; date_precision = 'month'; date_source = 'anchor';
    }
    return {
      id, location: segment.location,
      start_day_number: segment.start_day_number, end_day_number: segment.end_day_number,
      nights, date_precision, checkin_date, checkout_date, departure_month, date_source,
      board_item_ids: segment.board_item_ids,
    };
  });
  return {
    version: itineraryResult.version,
    days: boardDays,
    stay_segments: finalizedStaySegments,
  };
}

function defaultFetchMock() {
  return vi.fn(async (url, options) => {
    if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
    if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
    if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
    if (url.includes('/trusted-action')) {
      const body = options?.body ? JSON.parse(options.body) : {};
      if (body.domain === 'stay') return jsonResponse(stayActionResponse(body.preferred_partner));
      return jsonResponse(resolvedActionResponse());
    }
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
        itinerary_state: readyItineraryState(),
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
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
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
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
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
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
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
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
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
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, flightOnlyAssessment));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(flightOnlyAssessment);
        if (url.includes('/trusted-action')) return jsonResponse({ status: 'missing_input', generated_at: '2026-01-01T00:00:00.000Z', missing_input: { missing_fields: ['origin'], message: 'Tell us the missing details.' } });
        return jsonResponse({});
      });
      await openDrawer();
      await waitFor(() => expect(screen.getAllByText(/Flight/).length).toBeGreaterThan(0));
      expect(document.querySelector('a[href*="ixigo"]')).toBeNull();
    });
  });

  // TWM-216: the structured, Backend-owned booking_setup.party (never the
  // loose conversational num_travelers) is the traveler-count source for
  // transport CTA payloads.
  it('derives traveler_count from canonical booking_setup.party for transport CTA payloads', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { bookingSetup: { party: { adults: 2, children: 1, infants: 0 } } }, { trip_context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    let capturedBodies = [];
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
      if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
      if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
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

  // TWM-216: the itinerary revision-review flow (confirm_logistics + its
  // proposed-revision banner + accept/keep) is gone — confirm_logistics was
  // its only trigger, and nothing else proposes a revision.
  it('never renders a proposed-revision banner (the flow is removed)', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.queryByText(/This affects Day/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept the changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep current itinerary' })).not.toBeInTheDocument();
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
        const stale = boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse());
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

  // TWM-216: the trip calendar anchor (booking_setup.start) and structured
  // party (booking_setup.party) are edited once, from the Overview schedule
  // strip — never from inside a per-item drawer. Each drawer gets its own
  // per-entity date row instead (see the drawer describe blocks below).
  describe('Overview schedule strip — trip start and party (TWM-216)', () => {
    it('shows "Set trip start date" and "Set travellers" on Overview when neither is known yet', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      itineraryFetchResponse = {
        version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: null, date_range: null, overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } }),
      };
      global.fetch = defaultFetchMock();
      sendTripCommand = vi.fn();
      await readyDashboard();
      expect(screen.getByRole('button', { name: /Set trip start date/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Set travellers/ })).toBeInTheDocument();
    });

    it('saves the trip start via set_trip_start and reflects it on the strip', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('set_trip_start');
        expect(payload.tripStartUpdate).toEqual({ precision: 'exact', date: '2026-11-01' });
        commandSnapshot = snapshotWith(readyItineraryState(), { bookingSetup: { start: { precision: 'exact', date: '2026-11-01' } } }, { trip_context: { origin_city: 'Delhi' } });
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Set trip start date/ }));
      const input = await screen.findByLabelText('Trip start date');
      await user.clear(input);
      await user.type(input, '2026-11-01');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_trip_start', expect.anything()));
      await waitFor(() => expect(screen.getByRole('button', { name: /Trip starts: 2026-11-01 . Change/ })).toBeInTheDocument());
    });

    it('reverts an anchor to flexible via set_trip_start precision=flexible', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), { bookingSetup: { start: { precision: 'exact', date: '2026-11-01' } } }, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('set_trip_start');
        expect(payload.tripStartUpdate).toEqual({ precision: 'flexible' });
        commandSnapshot = snapshotWith(readyItineraryState(), { bookingSetup: {} }, { trip_context: { origin_city: 'Delhi' } });
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Trip starts: 2026-11-01 . Change/ }));
      await user.click(screen.getByRole('button', { name: 'Make dates flexible' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_trip_start', expect.anything()));
      await waitFor(() => expect(screen.getByRole('button', { name: /Set trip start date/ })).toBeInTheDocument());
    });

    it('saves the party via set_party and reflects it on the strip', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      itineraryFetchResponse = {
        version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: null, date_range: null, overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } }),
      };
      global.fetch = defaultFetchMock();
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('set_party');
        expect(payload.partyUpdate).toEqual({ adults: 1, children: 0, infants: 0 });
        commandSnapshot = snapshotWith(readyItineraryState(), { bookingSetup: { party: { adults: 1, children: 0, infants: 0 } } }, { trip_context: { origin_city: 'Delhi' } });
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Set travellers/ }));
      await user.click(screen.getByRole('button', { name: 'Save travelers' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_party', expect.anything()));
      await waitFor(() => expect(screen.getByRole('button', { name: /1 travelers . Change/ })).toBeInTheDocument());
    });

    it('never renders a trip-wide date or party editor inside a drawer', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      expect(within(drawer).queryByRole('button', { name: /trip start/i })).not.toBeInTheDocument();
      expect(within(drawer).queryByRole('button', { name: /Set travellers/ })).not.toBeInTheDocument();
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
      // TWM-216: the per-leg date form is collapsed by default, only
      // expanding once "Add exact dates for this search" is clicked.
      expect(within(drawer).queryByLabelText('Leg date')).toBeNull();
      expect(within(drawer).getByRole('button', { name: /Add exact dates for this search/ })).toBeInTheDocument();
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
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, busOnlyAssessment));
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
    it('refetches transport options after a per-leg date save invalidates the drawer cache', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      let trustedActionCallCount = 0;
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('set_search_pref');
        expect(payload.searchPrefUpdate).toEqual({ target_type: 'transport', target_id: 'test-trip:1:0', date: '2026-11-01' });
        commandSnapshot = snapshotWith(
          readyItineraryState(),
          { bookingSetup: { search_prefs: { transports: { 'test-trip:1:0': { precision: 'exact', date: '2026-11-01' } } } } },
          { trip_context: { origin_city: 'Delhi' } },
        );
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
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

      // TWM-216: the per-leg date affordance lives in the drawer's own date
      // row — reopen it and set the leg's search date, as a traveler would.
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      await user.click(within(drawer).getByRole('button', { name: /Add exact dates for this search/ }));
      await user.type(within(drawer).getByLabelText('Leg date'), '2026-11-01');
      await user.click(within(drawer).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_search_pref', expect.anything()));
      await user.click(within(drawer).getByRole('button', { name: 'Close transport options' }));

      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      // A real refetch happened — the stale cached entry from before the
      // date save was not reused.
      await waitFor(() => expect(trustedActionCallCount).toBeGreaterThan(callCountBeforeDateSave));
    });

    // Live-testing finding: saving dates via the strip without ever
    // closing the drawer (the actual, intended inline-editing flow) left
    // the drawer permanently showing "No bookable transport options for
    // this leg" -- submitDateEdit's setTransportData({}) cleared the cache
    // but nothing then refetched for the still-open leg, since only a
    // close+reopen (the previous test's flow) used to trigger a refetch.
    it('refetches transport options after a per-leg date save even when the drawer is never closed', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      let trustedActionCallCount = 0;
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('set_search_pref');
        expect(payload.searchPrefUpdate).toEqual({ target_type: 'transport', target_id: 'test-trip:1:0', date: '2026-11-01' });
        commandSnapshot = snapshotWith(
          readyItineraryState(),
          { bookingSetup: { search_prefs: { transports: { 'test-trip:1:0': { precision: 'exact', date: '2026-11-01' } } } } },
          { trip_context: { origin_city: 'Delhi' } },
        );
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action')) { trustedActionCallCount += 1; return jsonResponse(resolvedActionResponse()); }
        if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
        return jsonResponse({});
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Transport options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Transport options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Delhi to Rishikesh/ });
      await waitFor(() => expect(within(drawer).getAllByText(/Flight|Train|Bus|Drive/).length).toBeGreaterThan(0));

      await user.click(within(drawer).getByRole('button', { name: /Add exact dates for this search/ }));
      await user.type(within(drawer).getByLabelText('Leg date'), '2026-11-01');
      await user.click(within(drawer).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_search_pref', expect.anything()));

      // Without ever closing the drawer, options must still come back --
      // not a permanent "No bookable transport options for this leg".
      await waitFor(() => expect(within(drawer).queryByText('No bookable transport options for this leg.')).not.toBeInTheDocument());
      expect(within(drawer).getAllByText(/Flight|Train|Bus|Drive/).length).toBeGreaterThan(0);
    });

    // TWM-215: a search-scoped traveler-count override (e.g. only 3 of 4
    // travelers are on this specific gateway leg) must fetch independently
    // of the trip-wide default, and must never write booking_setup.party —
    // it only changes what this one search asks for.
    it('re-searches transport options for an overridden traveler count without touching booking_setup.party', async () => {
      commandSnapshot = snapshotWith(
        readyItineraryState(),
        { bookingSetup: { party: { adults: 4, children: 0, infants: 0 } } },
        { trip_context: { origin_city: 'Delhi' } },
      );
      sendTripCommand = vi.fn();
      let trustedActionCallCount = 0;
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
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
      await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      expect(within(drawer).getByText('Rishikesh · 2 nights')).toBeInTheDocument();
      expect(within(drawer).getByText('Rishikesh — Booking.com')).toBeInTheDocument();
      expect(within(drawer).getByText('Rishikesh — Agoda')).toBeInTheDocument();
      expect(within(drawer).getByText('Rishikesh — ixigo')).toBeInTheDocument();
      expect(within(drawer).getByText('Search Agoda ↗')).toBeInTheDocument();
      expect(within(drawer).getByText('Browse ixigo hotels ↗')).toBeInTheDocument();
    });

    // TWM-215/TWM-216: a per-segment check-in save from inside the stay
    // drawer must refetch the still-open drawer's links (submitPrefEdit's
    // setStayData({}) clears the cache; nothing refetched before this).
    it('refetches stay options after a per-segment check-in save even when the drawer is never closed', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      const capturedBodies = [];
      global.fetch = vi.fn(async (url, options) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
        if (url.includes('/trusted-action')) {
          const body = JSON.parse(options.body);
          capturedBodies.push(body);
          return jsonResponse(stayActionResponse(body.preferred_partner));
        }
        if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
        return jsonResponse({});
      });
      const segmentId = 'test-trip:stay:1:2:rishikesh';
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('set_search_pref');
        expect(payload.searchPrefUpdate).toEqual({ target_type: 'stay', target_id: segmentId, date: '2026-11-01' });
        commandSnapshot = snapshotWith(
          readyItineraryState(),
          { bookingSetup: { search_prefs: { stays: { [segmentId]: { precision: 'exact', date: '2026-11-01' } } } } },
          { trip_context: { origin_city: 'Delhi' } },
        );
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await waitFor(() => expect(screen.getByRole('button', { name: /Stay options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Stay options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
      await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      const initialTrustedActionCount = capturedBodies.length;

      await user.click(within(drawer).getByRole('button', { name: /Add exact dates for this search/ }));
      await user.type(within(drawer).getByLabelText('Check-in date'), '2026-11-01');
      await user.click(within(drawer).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_search_pref', expect.anything()));

      // Without ever closing the drawer, options must still come back.
      await waitFor(() => expect(capturedBodies.length).toBeGreaterThan(initialTrustedActionCount));
      expect(capturedBodies.slice(initialTrustedActionCount).some(body => body.domain === 'stay' && body.departure_date === '2026-11-01')).toBe(true);
      await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
    });

    it('refetches an open stay drawer with new derived dates after a trip-start save on Overview', async () => {
      commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: { origin_city: 'Delhi' } });
      const capturedBodies = [];
      global.fetch = vi.fn(async (url, options) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
        if (url.includes('/trusted-action')) {
          const body = JSON.parse(options.body);
          capturedBodies.push(body);
          return jsonResponse(stayActionResponse(body.preferred_partner));
        }
        if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
        return jsonResponse({});
      });
      sendTripCommand = vi.fn(async (command, payload) => {
        expect(command).toBe('set_trip_start');
        expect(payload.tripStartUpdate).toEqual({ precision: 'exact', date: '2026-11-01' });
        commandSnapshot = snapshotWith(
          readyItineraryState(),
          { bookingSetup: { start: { precision: 'exact', date: '2026-11-01' } } },
          { trip_context: { origin_city: 'Delhi' } },
        );
        return { message: null, agent_meta: null, trip: commandSnapshot };
      });
      const user = userEvent.setup();
      await readyDashboard();
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Stay options/ })).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Stay options/ }));
      const drawer = await screen.findByRole('dialog', { name: /Stay: Rishikesh/ });
      await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      const initialTrustedActionCount = capturedBodies.length;

      // The drawer is not tab-gated, so it stays open while we set the
      // trip-wide calendar anchor from the Overview schedule strip.
      await user.click(screen.getByRole('button', { name: /Overview/ }));
      await user.click(screen.getByRole('button', { name: /Set trip start date/ }));
      await user.type(screen.getByLabelText('Trip start date'), '2026-11-01');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(sendTripCommand).toHaveBeenCalledWith('set_trip_start', expect.anything()));

      await waitFor(() => expect(capturedBodies.length).toBeGreaterThan(initialTrustedActionCount));
      expect(capturedBodies.slice(initialTrustedActionCount).some(body => (
        body.domain === 'stay'
        && body.preferred_partner === 'booking_com'
        && body.departure_date === '2026-11-01'
        && body.return_date === '2026-11-03'
        && body.trip_shape === 'round_trip'
      ))).toBe(true);
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
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action')) {
          const body = JSON.parse(options.body);
          capturedBodies.push(body);
          return jsonResponse(stayActionResponse(body.preferred_partner));
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
      await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      expect(within(drawer).getByText('Jaipur · 1 night')).toBeInTheDocument();
      expect(within(drawer).getByText('Jaipur — ixigo')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /Stay: Agra/ })).not.toBeInTheDocument();
      expect(capturedBodies).toHaveLength(3);
      expect(capturedBodies.every(body => body.domain === 'stay' && body.destination === 'Jaipur')).toBe(true);
    });

    it('uses different Board-owned dates for different city stay segments in one trip', async () => {
      const day = (dayNumber, location) => ({
        day_number: dayNumber,
        date: null,
        title: `${location} day ${dayNumber}`,
        primary_location: location,
        summary: `Stay in ${location}.`,
        timeline: [
          {
            start_time: 'Night', end_time: null, kind: 'STAY', title: `Overnight in ${location}`, location,
            detail: `Stay in ${location}.`, movement_guidance: null, estimated_cost_low: 2000, estimated_cost_high: 4500,
            reference: generalReference(), requires_advance_booking: true, booking_readiness: 'needs_advance_booking',
          },
        ],
        notes: [],
        backup_plan: null,
      });
      itineraryFetchResponse = {
        version: 1,
        source_guide_revision: 3,
        created_at: '2026-01-01T00:00:00.000Z',
        result: atlasResult({
          final_itinerary: {
            trip_summary: {
              title: 'Jaipur and Agra',
              destinations: ['Jaipur', 'Agra'],
              duration_days: 4,
              num_travelers: 2,
              date_range: null,
              overview: 'A four-day route.',
              route_rationale: 'Two nights in each city.',
            },
            days: [day(1, 'Jaipur'), day(2, 'Jaipur'), day(3, 'Agra'), day(4, 'Agra')],
          },
        }),
      };
      commandSnapshot = snapshotWith(
        readyItineraryState(),
        { bookingSetup: { start: { precision: 'exact', date: '2026-11-01' } } },
        { trip_context: { origin_city: 'Delhi' } },
      );
      const capturedBodies = [];
      global.fetch = vi.fn(async (url, options) => {
        if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
        if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
        if (url.includes('/board')) return jsonResponse(boardResponseFor(itineraryFetchResponse, commandSnapshot?.trip_state, feasibleAssessmentResponse()));
        if (url.includes('/trusted-action/feasibility')) return jsonResponse(feasibleAssessmentResponse());
        if (url.includes('/trusted-action')) {
          const body = JSON.parse(options.body);
          capturedBodies.push(body);
          return jsonResponse(stayActionResponse(body.preferred_partner));
        }
        if (url.includes('/flight-search')) return jsonResponse(clarificationNeededResponse());
        return jsonResponse({});
      });
      sendTripCommand = vi.fn();
      const user = userEvent.setup();
      renderDashboard();
      await waitFor(() => expect(screen.getByText('Jaipur and Agra')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Itinerary/ }));

      await user.click(screen.getByRole('button', { name: /Stay options/ }));
      const jaipurDrawer = await screen.findByRole('dialog', { name: /Stay: Jaipur/ });
      await waitFor(() => expect(within(jaipurDrawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      expect(within(jaipurDrawer).getByText('📅 Check-in: 2026-11-01')).toBeInTheDocument();
      await user.click(within(jaipurDrawer).getByRole('button', { name: 'Close stay options' }));

      await user.click(within(screen.getByRole('navigation', { name: 'Select a day' })).getByRole('button', { name: /Day 3/ }));
      await user.click(screen.getByRole('button', { name: /Stay options/ }));
      const agraDrawer = await screen.findByRole('dialog', { name: /Stay: Agra/ });
      await waitFor(() => expect(within(agraDrawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      expect(within(agraDrawer).getByText('📅 Check-in: 2026-11-03')).toBeInTheDocument();

      expect(capturedBodies.some(body => (
        body.domain === 'stay'
        && body.destination === 'Jaipur'
        && body.preferred_partner === 'booking_com'
        && body.departure_date === '2026-11-01'
        && body.return_date === '2026-11-03'
      ))).toBe(true);
      expect(capturedBodies.some(body => (
        body.domain === 'stay'
        && body.destination === 'Agra'
        && body.preferred_partner === 'booking_com'
        && body.departure_date === '2026-11-03'
        && body.return_date === '2026-11-05'
      ))).toBe(true);
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
      await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      expect(within(drawer).queryByText('Non-binding estimate, per night')).toBeNull();
    });

    // PR review, TWM-206/TWM-216: stay partners have different redirect
    // capability levels, but no price/rating behind them —
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
      await waitFor(() => expect(within(drawer).getByText('Search Booking.com ↗')).toBeInTheDocument());
      expect(within(drawer).queryByText('Our pick')).not.toBeInTheDocument();
    });
  });

  it('Overview\'s day-strip jumps into that day on the Itinerary tab', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    const dayStrip = screen.getByRole('navigation', { name: 'Trip days' });
    await user.click(within(dayStrip).getByText('2'));
    expect(screen.getByRole('navigation', { name: 'Select a day' })).toBeInTheDocument();
    expect(screen.getByText('Ram Jhula')).toBeInTheDocument();
  });

  it('Overview renders real budget_summary totals and stat tiles', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
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

  // TripHero must never reflect a booking-precision fact (the
  // booking_setup.start calendar anchor), even once one is set -- it is an
  // itinerary-plan summary, not a booking surface, and trip_duration/
  // date_range are what Atlas actually planned around.
  it('keeps showing the travel-window label even once an exact trip start is set, never the booking-precision date', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { bookingSetup: { start: { precision: 'exact', date: '2026-10-12' } } }, { trip_context: {} });
    sendTripCommand = vi.fn();
    const base = atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 2, date_range: 'October', overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.' } } });
    itineraryFetchResponse = { version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z', result: base };
    global.fetch = defaultFetchMock();
    await readyDashboard();
    expect(screen.getAllByText('October').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('2026-10-12 – 2026-10-13')).toHaveLength(0);
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
  // TWM-216: TripHero is the itinerary-plan summary and must only ever show
  // what Atlas actually planned around (trip_summary.num_travelers), never
  // the exact booking_setup.party — that booking-precision fact belongs on
  // Overview's schedule strip, never on this surface.
  it('shows Atlas\'s planned num_travelers on TripHero, and the exact party only on the schedule strip', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { bookingSetup: { party: { adults: 2, children: 2, infants: 1 } } }, { trip_context: { origin_city: 'Delhi', num_travelers: 'a family of 5' } });
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 9, date_range: null, overview: 'x', route_rationale: 'y' } } }),
    };
    global.fetch = defaultFetchMock();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('9').filter(el => el.closest('.hero-stats')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('5').filter(el => el.closest('.hero-stats'))).toHaveLength(0);
    // The exact party total (2+2+1 = 5) shows only on Overview's strip.
    expect(screen.getByRole('button', { name: /5 travelers . Change/ })).toBeInTheDocument();
  });

  // TWM-215 live-testing finding, superseding the prior "never guess from
  // Atlas summary" rule this test used to assert: Atlas already resolves a
  // qualitative num_travelers answer (e.g. "couple") into a real number and
  // records the assumption transparently — hiding that resolved number
  // behind "Not set" was the actual bug (a genuinely-known rough fact
  // looked like nothing was known), not a safety net. Once composition is
  // unset, Atlas's trip_summary.num_travelers is now the honest fallback,
  // shown explicitly as an approximation rather than "Not set".
  it('shows Atlas\'s resolved num_travelers on TripHero when booking_setup.party is unset, not "Not set"', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), {}, { trip_context: {} });
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z',
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, num_travelers: 5, date_range: null, overview: 'x', route_rationale: 'y' } } }),
    };
    global.fetch = defaultFetchMock();
    sendTripCommand = vi.fn();
    await readyDashboard();
    expect(screen.getAllByText('5').filter(el => el.closest('.hero-stats')).length).toBeGreaterThan(0);
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {} },
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {} },
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {} },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      const link = await screen.findByRole('link', { name: '← Back to your trips' });
      expect(link).toHaveAttribute('href', '/');
    });

    it('shows budget as a row in "Your trip so far" when present, and omits it when absent', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi', budget: '₹1,00,000 total for both' }, planner_state: null, itinerary_state: {} },
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {} },
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
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {} },
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
          itinerary_state: {},
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
        trip_state: { stage: 'planning', trip_context: { destinations: ['Udaipur'] }, planner_state: { conversation_context: { awaiting: 'trip_duration' }, places: [], day_plan: [] }, itinerary_state: {} },
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
        trip_state: { stage: 'planning', trip_context: {}, planner_state: { conversation_context: {}, places: [], day_plan: [] }, itinerary_state: {} },
      };
      sendTripCommand = vi.fn();
      renderDashboard();
      await screen.findByText('Your trip so far');
      expect(sendTripCommand).not.toHaveBeenCalled();
    });

    it('unknown-destination Discover path (still gathering): Destination row shows "Continue chat"', async () => {
      commandSnapshot = {
        id: 'trip-1', version: 1,
        trip_state: { stage: 'matching', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {} },
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
        trip_state: { stage: 'recommended', trip_context: { origin_city: 'Delhi' }, planner_state: null, itinerary_state: {} },
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
          itinerary_state: {},
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
