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

  // TWM-234: flat, not hierarchical — every trip-scoped screen, Dashboard
  // included, points straight to the trips list. No intermediate "back to
  // trip" stop, and no dependence on which entry path (?intent=) got here.
  it.each([
    ['/scout-chat?tripId=trip-1'],
    ['/scout-chat?tripId=trip-1&intent=discover_destination'],
    ['/destinations?tripId=trip-1'],
    ['/trip-preview?tripId=trip-1'],
    ['/dashboard?tripId=trip-1'],
  ])('links to the trips list once a trip is current, from %s', async entry => {
    const fetchMock = mockFetchWithGuestSession();
    fetchMock.mockResolvedValue(jsonResponse({ trips: [{ id: 'trip-1', title: 'Coorg' }] }));
    renderBackToTrip([entry]);
    await waitFor(() => expect(screen.getByRole('link', { name: /back to your trips/i })).toHaveAttribute('href', '/'));
  });
});
