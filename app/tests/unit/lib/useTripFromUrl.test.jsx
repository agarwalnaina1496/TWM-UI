import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useTripFromUrl } from '../../../src/lib/useTripFromUrl.js';

function wrapper(initialPath) {
  return function Wrapper({ children }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}

describe('useTripFromUrl (TWM-185)', () => {
  it('does not call the resolver when the URL has no ?tripId=', () => {
    const resolveTrip = vi.fn();
    renderHook(() => useTripFromUrl(resolveTrip), { wrapper: wrapper('/dashboard') });
    expect(resolveTrip).not.toHaveBeenCalled();
  });

  it('calls the resolver once with the URL\'s trip id on mount', () => {
    const resolveTrip = vi.fn();
    renderHook(() => useTripFromUrl(resolveTrip), { wrapper: wrapper('/dashboard?tripId=trip-1') });
    expect(resolveTrip).toHaveBeenCalledTimes(1);
    expect(resolveTrip).toHaveBeenCalledWith('trip-1');
  });

  it('returns the resolved tripId', () => {
    const { result } = renderHook(() => useTripFromUrl(vi.fn()), { wrapper: wrapper('/dashboard?tripId=trip-1') });
    expect(result.current).toBe('trip-1');
  });

  it('preserves other query params — only reads tripId, ignores the rest', () => {
    const resolveTrip = vi.fn();
    renderHook(() => useTripFromUrl(resolveTrip), { wrapper: wrapper('/dashboard?tab=Bookings&tripId=trip-1') });
    expect(resolveTrip).toHaveBeenCalledWith('trip-1');
  });

  it('does not re-call the resolver on a re-render with the same tripId', () => {
    const resolveTrip = vi.fn();
    const { rerender } = renderHook(() => useTripFromUrl(resolveTrip), { wrapper: wrapper('/dashboard?tripId=trip-1') });
    rerender();
    rerender();
    expect(resolveTrip).toHaveBeenCalledTimes(1);
  });

  // Guards against a caller passing a not-yet-ready resolver (e.g. a mocked
  // useTrip() in a test that doesn't define every function) — never throws.
  it('does not throw when the resolver is not a function', () => {
    expect(() => renderHook(() => useTripFromUrl(undefined), { wrapper: wrapper('/dashboard?tripId=trip-1') })).not.toThrow();
  });
});
