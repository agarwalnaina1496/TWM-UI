import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TRIP_ID_PARAM } from './tripUrl.js';

// TWM-185: resolves whichever trip the URL says should be open, on mount and
// whenever the URL's ?tripId= changes — makes a hard reload, a bookmark, or
// a shared link land on the right trip instead of whatever TripContext's
// boot happened to pick. Each page passes its own resolver (TripContext's
// `openTrip` for pages that need full planner_state/matcher_state to decide
// what to do next, or `viewTrip` for Dashboard's cheap cache-first render —
// see those functions' own docs in TripContext.jsx for the cost tradeoff).
//
// `resolveTrip` is read through a ref, not a hook dependency, since
// TripContext's openTrip/viewTrip aren't memoized (new identity every
// render) — depending on it directly would re-fire this effect, and thus
// re-resolve the trip, on every unrelated re-render.
export function useTripFromUrl(resolveTrip) {
  const [params] = useSearchParams();
  const tripId = params.get(TRIP_ID_PARAM);
  const resolveRef = useRef(resolveTrip);
  resolveRef.current = resolveTrip;
  const resolvedFor = useRef(null);

  useEffect(() => {
    if (!tripId || resolvedFor.current === tripId || typeof resolveRef.current !== 'function') return;
    resolvedFor.current = tripId;
    resolveRef.current(tripId);
  }, [tripId]);

  return tripId;
}
