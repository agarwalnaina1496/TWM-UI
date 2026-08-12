import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../../src/App.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';

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

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TripProvider>
        <App />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('Landing (TWM-108 adaptive `/` resolver)', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'zero trips',
      { trips: [] },
      [tripRecord({ id: 'trip-new', trip_state: {} })],
      /where are we headed/i,
    ],
    [
      'one incomplete (matching) trip resumes to Scout chat',
      { trips: [{ id: 'trip-1' }] },
      [tripRecord({ trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } })],
      /tell scout/i,
    ],
    [
      'one itinerary-ready trip opens the Dashboard',
      { trips: [{ id: 'trip-1' }] },
      [tripRecord({ trip_state: { stage: 'planned', itinerary_state: { status: 'ready', current_version: { result: { final_itinerary: { trip_summary: { title: 'Coorg Getaway', destinations: ['Coorg'], duration_days: 1, travelers: 2, date_range: null, overview: '', route_rationale: '' }, travel_options: [], stay_options: [], days: [{ day_number: 1, date: null, title: 'Arrival', primary_location: 'Coorg', summary: '', timeline: [], seasonal_guidance: '', permit_or_ticket_guidance: '', backup_plan: null }], budget_summary: { currency: 'INR', lines: [], total_low: 0, total_high: 0, budget_fit: '' }, practical_notes: [], sources: [], assumptions: [] }, unresolved: [], agent_meta: { agent: 'atlas', prompt_version: '1.0.0' } } }, history: [], proposed_revision: null }, logistics_state: {} } })],
      /coorg getaway/i,
    ],
    [
      'multiple trips go to My Trips',
      { trips: [{ id: 'trip-1' }, { id: 'trip-2' }] },
      [
        tripRecord({ id: 'trip-1', trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } }),
        tripRecord({ id: 'trip-2', trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' } }, updated_at: '2025-12-01T00:00:00.000Z' }),
      ],
      /your.*trips/i,
    ],
    [
      'only a completed trip goes to My Trips',
      { trips: [{ id: 'trip-1' }] },
      [tripRecord({ trip_state: { stage: 'done', trip_context: { origin: 'Delhi' } } })],
      /your.*trips/i,
    ],
  ])('%s', async (_label, listBody, records, expectedHeading) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(listBody));
    records.forEach(record => fetchMock.mockResolvedValueOnce(jsonResponse(record)));

    renderLanding();

    await waitFor(() => expect(screen.getByRole('heading', { name: expectedHeading })).toBeInTheDocument());
  });

  it('deep link (/my-trips) bypasses the resolver even with a single resumable trip', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [{ id: 'trip-1' }] }))
      .mockResolvedValueOnce(jsonResponse(tripRecord({ trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } })));

    render(
      <MemoryRouter initialEntries={['/my-trips']}>
        <TripProvider>
          <App />
        </TripProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /your.*trips/i })).toBeInTheDocument();
  });
});
