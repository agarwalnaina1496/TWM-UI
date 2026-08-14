import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripDashboard from '../../../src/pages/TripDashboard.jsx';

let commandSnapshot;
let sendTripCommand;
let tripLoadStatus;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand, tripLoadStatus }),
}));

function generalReference() {
  return { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null };
}

function atlasResult(overrides = {}) {
  return {
    final_itinerary: {
      trip_summary: {
        title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, travelers: 2,
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

function snapshotWith(itineraryState, { anchors = [] } = {}) {
  return {
    id: 'trip-1',
    version: 1,
    trip_state: { trip_context: {}, itinerary_state: itineraryState, logistics_state: { anchors } },
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

function renderDashboard() {
  return render(<MemoryRouter><TripDashboard /></MemoryRouter>);
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

function defaultFetchMock() {
  return vi.fn(async (url) => {
    if (url.includes('/itinerary-versions')) return jsonResponse(itineraryVersionsResponse);
    if (url.endsWith('/itinerary')) return jsonResponse(itineraryFetchResponse);
    return jsonResponse({});
  });
}

describe('Trip Dashboard (real Atlas contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tripLoadStatus = 'ready';
    // Prior versions are fetched lazily via GET /trips/{id}/itinerary-versions
    // (TWM-155) — default to empty; individual tests override as needed.
    itineraryVersionsResponse = { versions: [] };
    // The active itinerary body is fetched lazily via GET /trips/{id}/itinerary
    // (TWM-159/160) — default to a ready single-version result.
    itineraryFetchResponse = { version: 1, source_guide_revision: 3, result: atlasResult(), created_at: '2026-01-01T00:00:00.000Z' };
    global.fetch = defaultFetchMock();
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
    expect(screen.getByText(/Building your detailed itinerary/)).toBeInTheDocument();
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
      trip_state: { trip_context: {}, itinerary_state: readyItineraryState(), logistics_state: { anchors: [] } },
    };
    itineraryFetchResponse = {
      version: 1, source_guide_revision: 4,
      result: atlasResult({ final_itinerary: { trip_summary: { title: 'Goa Escape', destinations: ['Goa'], duration_days: 2, travelers: 2, date_range: null, overview: '', route_rationale: '' } } }),
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

  it('renders Transport with only a confirmed anchor and the confirmation form — no guessed suggestions', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { anchors: [anchor()] });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    expect(screen.getByText('Delhi to Rishikesh arrival')).toBeInTheDocument();
    expect(screen.getByText('🔒 confirmed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Arrange bookings/ })).toHaveAttribute('href', '/logistics?tab=Transport');
    expect(screen.queryByText(/Atlas-suggested options/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a confirmation' }));
    expect(screen.getByRole('button', { name: 'Save confirmation' })).toBeDisabled();
  });

  it('submits a transport confirmation as a real confirm_logistics command', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn(async () => {
      commandSnapshot = snapshotWith(
        { ...readyItineraryState(), proposed_revision: { version: 2, base_version: 1, affected_days: [1], changes: ['Day 1: updated'], triggered_by: { anchor_id: 'a1', type: 'transport', label: 'x' }, result: atlasResult() } },
        { anchors: [anchor()] },
      );
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    await user.click(screen.getByRole('button', { name: 'Add a confirmation' }));
    await user.type(screen.getByLabelText("What's confirmed?"), 'Delhi to Rishikesh train');
    await user.type(screen.getByLabelText('Details'), 'Confirmed arrival at 2:00 PM via train 12050.');
    await user.click(screen.getByRole('button', { name: 'Save confirmation' }));

    expect(sendTripCommand).toHaveBeenCalledWith('confirm_logistics', {
      logisticsConfirmation: {
        type: 'transport', label: 'Delhi to Rishikesh train',
        detail: 'Confirmed arrival at 2:00 PM via train 12050.',
        day_number: null, reference: null, notes: null,
      },
    });
    await waitFor(() => expect(screen.getByText(/This affects Day 1/)).toBeInTheDocument());
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
    await user.click(screen.getByRole('button', { name: 'Accept changes' }));
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
    await user.click(screen.getByRole('button', { name: 'Keep current' }));
    expect(sendTripCommand).toHaveBeenCalledWith('keep_current_itinerary');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept changes' })).not.toBeInTheDocument());
  });

  it('shows an inline error and preserves the banner when accept fails', async () => {
    commandSnapshot = snapshotWith(readyItineraryState({
      proposedRevision: { version: 2, base_version: 1, affected_days: [1], changes: ['Day 1: updated'], triggered_by: { anchor_id: 'a1', type: 'transport', label: 'x' }, result: atlasResult() },
    }));
    sendTripCommand = vi.fn().mockRejectedValue(new Error('Trip has a newer version.'));
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: 'Accept changes' }));
    await waitFor(() => expect(screen.getByText('Trip has a newer version.')).toBeInTheDocument());
    expect(screen.getByText(/This affects Day 1/)).toBeInTheDocument();
  });

  it('places an anchor under the matching day, not other days', async () => {
    commandSnapshot = snapshotWith(readyItineraryState(), { anchors: [anchor({ day_number: 2, label: 'Riverside stay' })] });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    expect(screen.queryByText('Riverside stay')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Day 2/ }));
    expect(screen.getByText('Riverside stay')).toBeInTheDocument();
  });

  it('renders prior versions as a read-only disclosure', async () => {
    commandSnapshot = snapshotWith(readyItineraryState({ version: 2 }));
    sendTripCommand = vi.fn();
    itineraryVersionsResponse = {
      versions: [{ version: 1, source_guide_revision: 3, created_at: '2026-01-01T00:00:00.000Z', days: [{ day_number: 1, title: 'Arrival and ghats' }, { day_number: 2, title: 'Ram Jhula' }] }],
    };
    itineraryFetchResponse = { version: 2, source_guide_revision: 3, result: atlasResult(), created_at: '2026-01-02T00:00:00.000Z' };
    global.fetch = defaultFetchMock();
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Prior versions (1)')).toBeInTheDocument());
  });

  it('Map tab renders a deduped route order with day ranges and no coordinates', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Map/ }));
    const stops = document.querySelectorAll('.route-node'); // both days are Rishikesh — consecutive dedupe
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveTextContent('Rishikesh');
    expect(stops[0]).toHaveTextContent('Day 1–2');
  });

  it('Budget breakdown renders real budget_summary totals', async () => {
    commandSnapshot = snapshotWith(readyItineraryState());
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    await readyDashboard();
    await user.click(screen.getByRole('button', { name: /Budget breakdown/ }));
    expect(screen.getByText('Within a typical budget.')).toBeInTheDocument();
    expect(screen.getAllByText(/₹1,600–₹3,000/).length).toBeGreaterThan(0);
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
    await waitFor(() => expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument());
    expect(document.querySelector('img')).toBeNull();
  });
});
