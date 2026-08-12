// Canonical trip_state.stage/status helpers shared by the adaptive landing
// resolver and My Trips (TWM-108). Mirrors index_old.html's tripBadge/
// tripCtaConfig, extended with the planned/booked/done + itinerary-ready
// rows added to TWM_Docs/MY_TRIPS_CTA_MAPPING.md for this story. Reads only
// canonical `stage`/`status`/`itinerary_state` — never the legacy mock
// `plan`/`paid` fields.

export function hasTripContext(tripState) {
  return !!(tripState?.trip_context && Object.keys(tripState.trip_context).length > 0);
}

export function isItineraryReady(tripState) {
  return tripState?.itinerary_state?.status === 'ready';
}

// A freshly created trip with no traveler input yet — not a real trip for
// landing/My Trips purposes (mirrors "zero trips" from the traveler's view).
export function isTripEmpty(tripState) {
  return (tripState?.stage ?? 'new') === 'new' && !hasTripContext(tripState);
}

export function isCompletedTrip(tripState) {
  return tripState?.stage === 'done';
}

const STAGE_BADGES = {
  new: { cls: 'b-new', text: 'New' },
  matching: { cls: 'b-chat', text: 'In conversation' },
  recommendation_ready: { cls: 'b-chat', text: 'Ready to generate' },
  recommended: { cls: 'b-reco', text: 'Recommendations ready' },
  matched: { cls: 'b-matched', text: 'Destination chosen' },
  planning: { cls: 'b-matched', text: 'Planning in progress' },
  planned: { cls: 'b-done', text: 'Plan ready' },
  booked: { cls: 'b-done', text: 'Booked' },
  done: { cls: 'b-done', text: 'Completed' },
};

export function stageBadge(tripState) {
  const stage = tripState?.stage ?? 'new';
  if (isItineraryReady(tripState) && stage !== 'done') return { cls: 'b-done', text: 'Itinerary ready' };
  if (stage === 'new' && hasTripContext(tripState)) return { cls: 'b-chat', text: 'In conversation' };
  return STAGE_BADGES[stage] || STAGE_BADGES.new;
}

const STAGE_CTA = {
  new: { label: 'Start planning', to: '/' },
  matching: { label: 'Resume matching', to: '/scout-chat' },
  recommendation_ready: { label: 'Generate recommendations', to: '/scout-chat' },
  recommended: { label: 'Review recommendations', to: '/destinations' },
  matched: { label: 'Review recommendations', to: '/destinations' },
  planning: { label: 'Resume planning', to: '/trip-preview' },
  planned: { label: 'Open Dashboard', to: '/dashboard' },
  booked: { label: 'Open Dashboard', to: '/dashboard' },
  done: { label: 'View Dashboard', to: '/dashboard' },
};

// Stage-aware CTA for a My Trips card / the landing resolver's single-trip
// resume path. Itinerary-ready always wins regardless of stage label, since
// the Dashboard (TWM-107/97) is the real target once Atlas has produced a
// version — matching the story's required Dashboard CTA.
export function stageCta(tripState) {
  const stage = tripState?.stage ?? 'new';
  if (isItineraryReady(tripState)) return { label: stage === 'done' ? 'View Dashboard' : 'Open Dashboard', to: '/dashboard' };
  if (stage === 'new' && hasTripContext(tripState)) return { label: 'Resume chat', to: '/scout-chat' };
  return STAGE_CTA[stage] || STAGE_CTA.new;
}

// Adaptive `/` resolver (TWM-108): zero trips -> GetStarted; one incomplete
// -> resume; one itinerary-ready/upcoming -> Dashboard; multiple, or only
// completed, -> My Trips. `currentTripId` anchors the decision so "+ New
// Trip" (which makes a fresh empty trip current) always lands back on
// GetStarted instead of being redirected by other, older trips.
export function resolveLandingRoute({ trips = [], currentTripId } = {}) {
  const current = trips.find(t => t.id === currentTripId) ?? trips[0] ?? null;
  if (!current || isTripEmpty(current.trip_state)) return '/';

  const meaningful = trips.filter(t => !isTripEmpty(t.trip_state));
  if (meaningful.length > 1) return '/my-trips';
  if (isCompletedTrip(current.trip_state)) return '/my-trips';
  if (isItineraryReady(current.trip_state)) return '/dashboard';
  return stageCta(current.trip_state).to;
}
