import { useQuery } from '@tanstack/react-query';
import { getRecommendations, getTrip, listTrips, TripApiError } from '../lib/tripApi.js';
import { tripKeys } from '../lib/tripKeys.js';

export { tripKeys };

// GET /trips — the guest's thin TripListItem list. Drives the adaptive
// landing resolver and My Trips.
export function useTripsQuery() {
  return useQuery({ queryKey: tripKeys.list, queryFn: listTrips });
}

// GET /trips/{id} — the composed TripView. `enabled` is gated on id so a
// null current trip parks the query idle rather than firing a request. Also
// what TripContext reads internally for `commandSnapshot` / `tripLoadStatus`.
export function useTripQuery(id) {
  return useQuery({
    queryKey: tripKeys.trip(id),
    queryFn: () => getTrip(id),
    enabled: !!id,
  });
}

// GET /trips/{id}/recommendations — the current matcher round. A trip with
// no round yet 404s; that is a normal "no round" state, not an error. After
// a command the round is written straight into this cache by
// TripContext.sendTripCommand (no follow-up GET).
export function useRecommendationsQuery(id) {
  return useQuery({
    queryKey: tripKeys.recommendations(id),
    queryFn: async () => {
      try {
        return await getRecommendations(id);
      } catch (error) {
        if (error instanceof TripApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!id,
    retry: false,
  });
}
