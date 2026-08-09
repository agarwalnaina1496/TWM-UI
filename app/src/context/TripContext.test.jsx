import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TripProvider, useTrip } from './TripContext.jsx';

function wrapper({ children }) {
  return <TripProvider>{children}</TripProvider>;
}

describe('TripContext auth state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to no access', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: false, name: '', email: '' });
    expect(result.current.hasAccess).toBe(false);
  });

  it('login sets loggedIn true and isGuest false', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.login({ name: 'Traveler', email: 't@example.com' }));
    expect(result.current.auth).toEqual({ loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('continueWithoutLogin sets isGuest true and loggedIn false', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.continueWithoutLogin());
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Guest', email: '' });
    expect(result.current.hasAccess).toBe(true);
  });

  it('logout resets to default and removes access', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.login({ name: 'Traveler', email: 't@example.com' }));
    act(() => result.current.logout());
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: false, name: '', email: '' });
    expect(result.current.hasAccess).toBe(false);
  });

  it('setContact updates name/email without changing loggedIn/isGuest', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.continueWithoutLogin());
    act(() => result.current.setContact({ name: 'Jane', email: 'jane@example.com' }));
    expect(result.current.auth).toEqual({ loggedIn: false, isGuest: true, name: 'Jane', email: 'jane@example.com' });
  });

  it('persists trip and auth to localStorage and reloads them', () => {
    const { result, unmount } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.login({ name: 'Traveler', email: 't@example.com' }));
    act(() => result.current.updateTrip({ destination: 'Coorg' }));
    unmount();

    const { result: reloaded } = renderHook(() => useTrip(), { wrapper });
    expect(reloaded.current.auth.name).toBe('Traveler');
    expect(reloaded.current.trip.destination).toBe('Coorg');
  });

  it('startNewTrip resets trip fields', () => {
    const { result } = renderHook(() => useTrip(), { wrapper });
    act(() => result.current.updateTrip({ destination: 'Coorg' }));
    act(() => result.current.startNewTrip());
    expect(result.current.trip.destination).toBe('');
  });
});
