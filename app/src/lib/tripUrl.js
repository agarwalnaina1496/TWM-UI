// TWM-185: the single query-string convention for carrying trip identity
// across the 5 trip-specific routes (/dashboard, /scout-chat, /journey-entry,
// /destinations, /trip-preview). A query string, not a route param
// (`/dashboard/:id`), to fit the app's existing flat-route style (App.jsx)
// and coexist with each page's own existing query params (?tab=, ?intent=,
// ?msg=) without restructuring routes.
export const TRIP_ID_PARAM = 'tripId';

// Appends/overwrites ?tripId= on a path while preserving any other query
// params already on it (e.g. withTripId('/journey-entry?intent=discover', id)).
// Returns `to` unchanged when there's no id to attach — most callers pass a
// possibly-null tripId (e.g. a trip not yet created) and should not fabricate
// a param in that case.
export function withTripId(to, tripId) {
  if (!tripId) return to;
  const [path, search] = to.split('?');
  const params = new URLSearchParams(search || '');
  params.set(TRIP_ID_PARAM, tripId);
  return `${path}?${params.toString()}`;
}
