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

// Verbatim, top-level trip_context fields worth showing as a quick recap
// (Destinations' pre-recommendation pills, My Trips cards). Never bucketed
// into a generic label — an exact persisted value or nothing, so
// "₹1,00,000 total for both" never degrades to "Flexible budget".
// trip_context is free-form (Scout extracts whatever field names fit the
// conversation — see TWM_Docs/TRIP_STATE.md), so this list is a best-effort
// set of the field names Scout commonly uses, not a guaranteed schema.
const RECAP_FIELDS = [
  ['origin', value => `From ${value}`],
  ['budget', value => String(value)],
  ['duration_days', value => `${value} day${value === 1 ? '' : 's'}`],
  ['travelers', value => `${value} traveler${value === 1 ? '' : 's'}`],
  ['travel_window', value => String(value)],
  ['month', value => String(value)],
  ['dates', value => String(value)],
];

export function contextRecapPills(tripContext) {
  return RECAP_FIELDS
    .map(([key, format]) => {
      const value = tripContext?.[key];
      return value === undefined || value === null || value === '' ? null : format(value);
    })
    .filter(Boolean);
}

// The traveler's confirmed destination, once one exists — UI-owned
// (trip_context.selected_option), not a Meridian recommendation guess.
export function contextDestination(tripContext) {
  const name = tripContext?.selected_option?.name;
  return typeof name === 'string' && name.trim() ? name : null;
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
  planned: { label: 'View trip', to: '/dashboard' },
  booked: { label: 'View trip', to: '/dashboard' },
  done: { label: 'View trip', to: '/dashboard' },
};

// Stage-aware CTA for a Dashboard-home card / the landing resolver's
// single-trip resume path. Itinerary-ready always wins regardless of stage
// label, since the per-trip Dashboard (TWM-107/97) is the real target once
// Atlas has produced a version — matching the story's required Dashboard CTA.
// Labeled "View trip", not "Open/View Dashboard" (TWM-165) — the traveler is
// already on Dashboard-home when they see this, so naming the destination
// after the page they're leaving reads as confusing self-reference.
export function stageCta(tripState) {
  const stage = tripState?.stage ?? 'new';
  if (isItineraryReady(tripState)) return { label: 'View trip', to: '/dashboard' };
  if (stage === 'new' && hasTripContext(tripState)) return { label: 'Resume chat', to: '/scout-chat' };
  return STAGE_CTA[stage] || STAGE_CTA.new;
}
