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

// TWM-233: updates the address bar's query string in place via the raw
// History API, deliberately bypassing react-router's own navigate() --
// several routes (e.g. /journey-entry, see App.jsx's `key={location.search}`)
// intentionally remount their page on any react-router-visible search-param
// change. A page that just created a trip and wants to anchor ?tripId= (or
// drop a consumed ?msg=) needs the opposite: the browser's own address bar
// updated, so a subsequent *reload* reads it correctly, without disturbing
// the current render at all. react-router's own useSearchParams() will not
// reflect this change until the next real navigation or reload -- callers
// relying on already-fresh in-memory state (e.g. TripContext's
// currentTripId) for the rest of the live session are unaffected by that.
export function syncUrlParamsSilently(nextParams) {
  window.history.replaceState(null, '', `${window.location.pathname}?${nextParams.toString()}`);
}
