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

function renderLanding(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripProvider>
        <App />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('Landing (TWM-163 Dashboard-as-home resolver)', () => {
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
      'zero trips shows Dashboard-home with its own empty state, not GetStarted',
      [],
    ],
    [
      'one incomplete (matching) trip shows Dashboard-home, not an auto-resume',
      [tripRecord({ trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } })],
    ],
    [
      'one itinerary-ready trip shows Dashboard-home, not an auto-open Dashboard',
      [tripRecord({ trip_state: { stage: 'planned', trip_context: { origin: 'Delhi' }, itinerary_state: { status: 'ready' } } })],
    ],
    [
      'multiple trips show Dashboard-home',
      [
        tripRecord({ id: 'trip-1', trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } }),
        tripRecord({ id: 'trip-2', trip_state: { stage: 'recommended', trip_context: { origin: 'Delhi' } }, updated_at: '2025-12-01T00:00:00.000Z' }),
      ],
    ],
    [
      'only a completed trip shows Dashboard-home',
      [tripRecord({ trip_state: { stage: 'done', trip_context: { origin: 'Delhi' } } })],
    ],
  ])('%s', async (_label, trips) => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/trips') return jsonResponse({ trips });
      return jsonResponse({});
    });

    renderLanding();

    await waitFor(() => expect(screen.getByRole('heading', { name: /your.*trips/i })).toBeInTheDocument());
  });

  it('shows the empty-state copy and New Trip CTA when there are zero trips', async () => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/trips') return jsonResponse({ trips: [] });
      return jsonResponse({});
    });

    renderLanding();

    expect(await screen.findByText('No trips yet')).toBeInTheDocument();
  });

  it('skipResume state always lands on GetStarted, even with existing trip history', async () => {
    fetchMock.mockImplementation(async (path) => {
      if (path === '/api/trips') return jsonResponse({ trips: [tripRecord({ trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } })] });
      return jsonResponse({});
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/', state: { skipResume: true } }]}>
        <TripProvider>
          <App />
        </TripProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: /where are we headed/i })).toBeInTheDocument());
  });

  it('deep link (/my-trips) renders Dashboard-home directly', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ trips: [tripRecord({ trip_state: { stage: 'matching', trip_context: { origin: 'Delhi' } } })] }));

    render(
      <MemoryRouter initialEntries={['/my-trips']}>
        <TripProvider>
          <App />
        </TripProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /your.*trips/i })).toBeInTheDocument();
  });
});
