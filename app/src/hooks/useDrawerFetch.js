import { useEffect } from 'react';

export function useDrawerFetch(openKey, cache, loading, fetcher) {
  useEffect(() => {
    if (!openKey || cache[openKey] || loading) return;
    fetcher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, cache, loading]);
}
