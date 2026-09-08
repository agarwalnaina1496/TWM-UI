import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BackToTrip from '../../../src/components/BackToTrip.jsx';
import { AppProviders, mockFetchWithGuestSession } from '../testUtils.js';

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function renderBackToTrip(entries = ['/scout-chat']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <AppProviders><BackToTrip /></AppProviders>
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

  // TWM-185/TWM-221: carries the current trip's id — resolved from the URL's
  // ?tripId= on a Build screen — so landing on Dashboard from here is
  // reload/bookmark safe, not just a same-session in-memory jump.
  it('links to Dashboard with the current trip\'s id once a trip is current', async () => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValue(jsonResponse({ trips: [{ id: 'trip-1', title: 'Coorg' }] }));
    renderBackToTrip(['/scout-chat?tripId=trip-1']);
    await waitFor(() => expect(screen.getByRole('link', { name: /back to trip/i })).toHaveAttribute('href', '/dashboard?tripId=trip-1'));
  });
});
