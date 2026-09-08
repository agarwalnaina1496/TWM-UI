import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useTrip } from '../../../src/context/TripContext.jsx';
import { useTripQuery } from '../../../src/hooks/tripQueries.js';
import { AppProviders, mockFetchWithGuestSession } from '../testUtils.js';

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function tripView(id, over = {}) {
  return jsonResponse({
    id, title: id, product_mode: 'self_led', version: 2, ui_state: {},
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    lifecycle: { stage: 'new', status: 'free', active_agent: null, selected_option: null },
    context_recap: [], plan: null, matcher: { last_message: null, awaiting: null, has_recommendation: false },
    summary: null, booking: null, budget_breakdown: null, open_gaps: null, before_you_go: null, ...over,
  });
}

// A component that reads ONLY useTripQuery — never useTrip() — so context
// changes (auth, login modal) must not re-render it.
let tripRenders = 0;
function TripOnly({ id }) {
  tripRenders += 1;
  const { data } = useTripQuery(id);
  return <div>trip:{data?.id ?? 'none'}</div>;
}

let fetchCount = 0;
function AuthPoker() {
  const { openLoginModal, currentTripId } = useTrip();
  return <button type="button" onClick={openLoginModal}>poke {currentTripId ?? '-'}</button>;
}

describe('tripQueries data layer (TWM-221)', () => {
  beforeEach(() => {
    tripRenders = 0;
    fetchCount = 0;
    const fm = mockFetchWithGuestSession();
    fm.mockImplementation((url) => {
      if (url === '/api/trips') return Promise.resolve(jsonResponse({ trips: [] }));
      if (/^\/api\/trips\/trip-1/.test(url)) { fetchCount += 1; return Promise.resolve(tripView('trip-1')); }
      return Promise.resolve(jsonResponse({}));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('a useTripQuery-only consumer does not re-render when auth / the login modal changes', async () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <TripOnly id="trip-1" />
          <AuthPoker />
        </AppProviders>
      </MemoryRouter>,
    );
    await screen.findByText('trip:trip-1');
    const settled = tripRenders;
    await act(async () => { screen.getByRole('button', { name: /poke/ }).click(); });
    expect(tripRenders).toBe(settled);
  });

  it('two components observing the same trip key trigger a single fetch (dedupe)', async () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <TripOnly id="trip-1" />
          <TripOnly id="trip-1" />
        </AppProviders>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText('trip:trip-1')).toHaveLength(2));
    expect(fetchCount).toBe(1);
  });
});
