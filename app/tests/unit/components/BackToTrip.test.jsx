import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BackToTrip from '../../../src/components/BackToTrip.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { mockFetchWithGuestSession } from '../testUtils.js';

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function renderBackToTrip() {
  return render(
    <MemoryRouter>
      <TripProvider><BackToTrip /></TripProvider>
    </MemoryRouter>
  );
}

describe('BackToTrip', () => {
  afterEach(() => vi.restoreAllMocks());

  it('links to Dashboard with no trip id when no trip is current yet', async () => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderBackToTrip();
    await waitFor(() => expect(screen.getByRole('link', { name: /back to trip/i })).toHaveAttribute('href', '/dashboard'));
  });

  // TWM-185: carries the current trip's id so landing on Dashboard from here
  // is reload/bookmark safe, not just a same-session in-memory jump.
  it('links to Dashboard with the current trip\'s id once a trip is current', async () => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      trips: [{ id: 'trip-1', title: 'Coorg', trip_state: { stage: 'planning' } }],
    }));
    renderBackToTrip();
    await waitFor(() => expect(screen.getByRole('link', { name: /back to trip/i })).toHaveAttribute('href', '/dashboard?tripId=trip-1'));
  });
});
