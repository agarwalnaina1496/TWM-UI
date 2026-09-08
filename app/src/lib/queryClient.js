import { QueryClient } from '@tanstack/react-query';

// TWM-221: the client data layer. One QueryClient for the app; tests build
// their own per-test. `staleTime` gives stale-while-revalidate — a cached
// trip renders instantly and revalidates in the background — while the
// hand-rolled loader / merge / re-GET machinery is retired.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export const queryClient = makeQueryClient();
