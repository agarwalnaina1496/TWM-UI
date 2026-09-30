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

  // TWM-234: nothing to go back to yet — a genuinely fresh, not-yet-created
  // trip renders no back-link at all, on any trip-scoped screen.
  it('renders nothing when no trip is current yet', async () => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ trips: [] }));
    renderBackToTrip();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // TWM-185/TWM-221/TWM-234: carries the current trip's id — resolved from
  // the URL's ?tripId= on a Build screen — so landing on Dashboard from here
  // is reload/bookmark safe, not just a same-session in-memory jump. Renders
  // identically regardless of which entry path (?intent=) put the trip here.
  it('links to Dashboard with the current trip\'s id from a trip-scoped screen', async () => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValue(jsonResponse({ trips: [{ id: 'trip-1', title: 'Coorg' }] }));
    renderBackToTrip(['/scout-chat?tripId=trip-1']);
    await waitFor(() => expect(screen.getByRole('link', { name: /back to trip/i })).toHaveAttribute('href', '/dashboard?tripId=trip-1'));
  });

  it('links to Dashboard with the current trip\'s id regardless of entry-flavor intent on the URL', async () => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValue(jsonResponse({ trips: [{ id: 'trip-1', title: 'Coorg' }] }));
    renderBackToTrip(['/scout-chat?tripId=trip-1&intent=discover_destination']);
    await waitFor(() => expect(screen.getByRole('link', { name: /back to trip/i })).toHaveAttribute('href', '/dashboard?tripId=trip-1'));
  });

  // TWM-234: Dashboard is the top of the trip-scoped hierarchy — its own
  // back-link points up to the trips list, not to itself.
  it('links to the trips list from Dashboard itself', async () => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValue(jsonResponse({ trips: [{ id: 'trip-1', title: 'Coorg' }] }));
    renderBackToTrip(['/dashboard?tripId=trip-1']);
    await waitFor(() => expect(screen.getByRole('link', { name: /back to your trips/i })).toHaveAttribute('href', '/'));
  });
});
