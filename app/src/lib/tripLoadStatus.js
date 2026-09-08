// TWM-221: pages still gate rendering on a single string status
// (idle | loading | ready | error). React Query gives us richer query state;
// this collapses the trips-list query + the current-trip query back to that
// one contract so page render guards did not have to change.
//
//   - trips list failed        → 'error'
//   - trips list still loading  → 'loading'
//   - no current trip selected  → 'ready' (commandSnapshot is null)
//   - current trip failed       → 'error'
//   - current trip still loading → 'loading'
//   - current trip resolved     → 'ready'
export function deriveTripLoadStatus({ currentTripId, tripsQuery, tripQuery }) {
  if (tripsQuery.isError) return 'error';
  if (tripsQuery.isPending) return 'loading';
  if (!currentTripId) return 'ready';
  if (tripQuery.isError) return 'error';
  if (tripQuery.isLoading || tripQuery.data === undefined) return 'loading';
  return 'ready';
}
