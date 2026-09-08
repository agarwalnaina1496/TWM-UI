import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useTripFromUrl } from '../../../src/hooks/useTripFromUrl.js';
import { useTrip } from '../../../src/context/TripContext.jsx';
import { AppProviders, mockFetchWithGuestSession } from '../testUtils.js';

function wrapper(initialPath) {
  return function Wrapper({ children }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <AppProviders>{children}</AppProviders>
      </MemoryRouter>
    );
  };
}

// TWM-221: useTripFromUrl no longer takes a resolver — the URL's ?tripId=
// becomes TripContext's currentTripId, and the ['trip', id] query does the
// fetching. It still returns the raw URL param so pages can tell an explicit
// trip link apart from the boot default.
describe('useTripFromUrl', () => {
  beforeEach(() => { mockFetchWithGuestSession(); });

  it('returns null when the URL has no ?tripId=', () => {
    const { result } = renderHook(() => useTripFromUrl(), { wrapper: wrapper('/dashboard') });
    expect(result.current).toBeNull();
  });

  it('returns the URL\'s trip id', () => {
    const { result } = renderHook(() => useTripFromUrl(), { wrapper: wrapper('/dashboard?tripId=trip-1') });
    expect(result.current).toBe('trip-1');
  });

  it('reads only tripId, ignoring other query params', () => {
    const { result } = renderHook(() => useTripFromUrl(), { wrapper: wrapper('/dashboard?tab=Bookings&tripId=trip-7') });
    expect(result.current).toBe('trip-7');
  });

  it('points currentTripId at the URL\'s trip', async () => {
    const { result } = renderHook(
      () => ({ url: useTripFromUrl(), ctx: useTrip() }),
      { wrapper: wrapper('/dashboard?tripId=trip-9') },
    );
    await Promise.resolve();
    expect(result.current.ctx.currentTripId).toBe('trip-9');
  });
});
