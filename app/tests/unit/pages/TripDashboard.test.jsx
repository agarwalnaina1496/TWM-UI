import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripDashboard from '../../../src/pages/TripDashboard.jsx';

let commandSnapshot;
let sendTripCommand;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand }),
}));

function generalReference() {
  return { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null };
}

function verifiedReference() {
  return { status: 'VERIFIED', source_title: 'Official rail booking', source_url: 'https://example.com/rail' };
}

function atlasResult(overrides = {}) {
  return {
    final_itinerary: {
      trip_summary: {
        title: 'Rishikesh Getaway', destinations: ['Rishikesh'], duration_days: 2, travelers: 2,
        date_range: null, overview: 'A calm riverside trip.', route_rationale: 'Everything is within one town.',
      },
      travel_options: [{
        from_place: 'Delhi', to_place: 'Rishikesh', mode: 'Bus', suggestion: 'Overnight Volvo.',
        duration_guidance: 'About 7 hours.', estimated_cost_low: 600, estimated_cost_high: 900,
        reference: verifiedReference(), booking_readiness: 'needs_advance_booking',
      }],
      stay_options: [{
        location: 'Rishikesh', suggestion: 'Riverside guesthouse.', nights: 2, check_in_day: 1, check_out_day: 3,
        why_it_fits: 'Central and budget-friendly.', estimated_cost_low: 1600, estimated_cost_high: 3000,
        reference: generalReference(), booking_readiness: 'suggested',
      }],
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

function snapshotWith(itineraryState) {
  return { version: 1, trip_state: { trip_context: {}, itinerary_state: itineraryState } };
}

function renderDashboard() {
  return render(<MemoryRouter><TripDashboard /></MemoryRouter>);
}

describe('Trip Dashboard (real Atlas contract)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls start_itinerary once when no saved result exists, then renders it', async () => {
    commandSnapshot = snapshotWith({});
    sendTripCommand = vi.fn(async command => {
      if (command === 'start_itinerary') {
        commandSnapshot = snapshotWith({ status: 'ready', version: 1, source_guide_revision: 3, result: atlasResult() });
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument());
    expect(sendTripCommand).toHaveBeenCalledTimes(1);
    expect(sendTripCommand).toHaveBeenCalledWith('start_itinerary');
  });

  it('reopen never re-invokes Atlas when a result is already saved', () => {
    commandSnapshot = snapshotWith({ status: 'ready', version: 1, source_guide_revision: 3, result: atlasResult() });
    sendTripCommand = vi.fn();
    renderDashboard();
    expect(screen.getByText('Rishikesh Getaway')).toBeInTheDocument();
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('shows an error state when itinerary generation fails', async () => {
    commandSnapshot = snapshotWith({});
    sendTripCommand = vi.fn().mockRejectedValue(new Error('The travel assistant returned an invalid response.'));
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The travel assistant returned an invalid response.'));
  });

  it('renders assumptions and unresolved items safely', () => {
    commandSnapshot = snapshotWith({ status: 'ready', version: 1, result: atlasResult() });
    sendTripCommand = vi.fn();
    renderDashboard();
    expect(screen.getByText(/Assumed a start date since none was confirmed\./)).toBeInTheDocument();
    expect(screen.getByText(/Check schedules closer to travel\./)).toBeInTheDocument();
  });

  it('renders Transport with booking-readiness and only a source link for VERIFIED references', async () => {
    commandSnapshot = snapshotWith({ status: 'ready', version: 1, result: atlasResult() });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    expect(screen.getByText('Needs advance booking')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Official rail booking/ })).toHaveAttribute('href', 'https://example.com/rail');
    expect(screen.getByRole('button', { name: 'Upload transport confirmation' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /Arrange bookings/ })).toHaveAttribute('href', '/logistics?tab=Transport');
  });

  it('renders Stays with booking-readiness and no source link for GENERAL_GUIDANCE references', async () => {
    commandSnapshot = snapshotWith({ status: 'ready', version: 1, result: atlasResult() });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Stays/ }));
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Source/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload stay confirmation' })).toBeDisabled();
  });

  it('Map tab renders a text-only, deduped route order with no coordinates', async () => {
    commandSnapshot = snapshotWith({ status: 'ready', version: 1, result: atlasResult() });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Map/ }));
    const items = screen.getByRole('list', { name: 'Route order' }).querySelectorAll('li');
    expect(items).toHaveLength(1); // both days are Rishikesh — consecutive dedupe
    expect(items[0]).toHaveTextContent('Rishikesh');
  });

  it('Budget breakdown renders real budget_summary totals', async () => {
    commandSnapshot = snapshotWith({ status: 'ready', version: 1, result: atlasResult() });
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Budget breakdown/ }));
    expect(screen.getByText('Within a typical budget.')).toBeInTheDocument();
    expect(screen.getAllByText(/₹1,600–₹3,000/).length).toBeGreaterThan(0);
  });

  it('renders unsafe text as inert content, never as markup', () => {
    commandSnapshot = snapshotWith({
      status: 'ready', version: 1,
      result: atlasResult({ final_itinerary: { assumptions: [{ category: 'other', detail: '<img src=x onerror=alert(1)>' }] } }),
    });
    sendTripCommand = vi.fn();
    renderDashboard();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
