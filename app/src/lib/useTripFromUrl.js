import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { TRIP_ID_PARAM } from './tripUrl.js';

// TWM-185/TWM-221: points TripContext's `currentTripId` at whichever trip the
// URL's ?tripId= names, on mount and whenever it changes — so a hard reload,
// a bookmark, or a shared link lands on the right trip. The fetching is the
// `useQuery(['trip', id])` in `useCurrentTrip`; the query key *is* the trip
// id, so the old defensive-ref resolver workaround is gone.
//
// Returns the URL's raw ?tripId= (or null) — pages use it to tell "reached
// with an explicit trip in the URL" apart from "landed on the boot default".
export function useTripFromUrl() {
  const [params] = useSearchParams();
  const tripId = params.get(TRIP_ID_PARAM);
  const { currentTripId, setCurrentTripId } = useTrip();

  useEffect(() => {
    if (tripId && tripId !== currentTripId) setCurrentTripId(tripId);
  }, [tripId, currentTripId, setCurrentTripId]);

  return tripId;
}
