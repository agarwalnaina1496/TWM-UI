import { createElement, useEffect, useState } from 'react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripProvider, useTrip } from '../../src/context/TripContext.jsx';

// TWM-221: a fresh QueryClient per test — retries off (a rejected queryFn
// surfaces immediately), no background refetch, no GC between assertions.
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

// Wraps a subtree in a throwaway QueryClient. Pair with a real <TripProvider>
// for tests that exercise the live data layer. (No JSX — this file is .js.)
export function TestQueryProvider({ client, children }) {
  const [fallback] = useState(createTestQueryClient);
  return createElement(QueryClientProvider, { client: client ?? fallback }, children);
}

// TWM-221: <TripProvider> now depends on a QueryClient in context. This
// bundles the two so a test can swap `<TripProvider>` → `<AppProviders>`
// with no other change. Pass `client` to seed / inspect the cache.
export function AppProviders({ client, children }) {
  const [fallback] = useState(createTestQueryClient);
  return createElement(
    QueryClientProvider,
    { client: client ?? fallback },
    createElement(TripProvider, null, children),
  );
}

// Seeds TripContext's in-memory auth state directly via setAuthDirect,
// bypassing the real signup/login network calls entirely. Mount this once,
// inside a TripProvider, above the component under test.
export function SeedAuth({ auth, children }) {
  const { setAuthDirect, continueWithoutLogin } = useTrip();
  useEffect(() => {
    if (auth?.loggedIn) setAuthDirect(auth);
    else continueWithoutLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children;
}

// Same /api/auth/me interception, delegating everything else to an
// already-constructed mock (e.g. one built with a specific
// mockResolvedValueOnce() queue) — returns the wrapper to assign to
// global.fetch; the caller keeps its own reference to `tripsFetch` for
// assertions (it never sees the /api/auth/me call).
export function wrapFetchMockWithGuestSession(tripsFetch, { authenticatedAs = null } = {}) {
  return vi.fn((url, options) => {
    if (url === '/api/auth/me') {
      return authenticatedAs
        ? Promise.resolve({ ok: true, status: 200, json: async () => authenticatedAs })
        : Promise.resolve({ ok: false, status: 401, json: async () => ({ detail: 'Not authenticated.' }) });
    }
    return tripsFetch(url, options);
  });
}

// TripProvider's boot effect checks the real session via GET /api/auth/me
// (TWM-180) alongside the GET /api/trips boot load — the two fire in
// parallel, so a plain positional mockResolvedValueOnce() queue can't
// reliably express both. This builds a fresh tripsFetch, wraps it, and
// assigns global.fetch — tests built around /api/trips's call sequence
// keep working unmodified against the returned tripsFetch. Pass
// `authenticatedAs` to simulate an already-logged-in session on boot.
export function mockFetchWithGuestSession({ authenticatedAs = null } = {}) {
  const tripsFetch = vi.fn();
  global.fetch = wrapFetchMockWithGuestSession(tripsFetch, { authenticatedAs });
  return tripsFetch;
}
