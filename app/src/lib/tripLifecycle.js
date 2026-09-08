// Canonical stage/status helpers shared by the adaptive landing resolver
// and My Trips. TWM-220: every consumer now reads a `TripView` (full) or a
// `TripListItem` (thin) — both carry `lifecycle` and `context_recap`; only
// the full view carries `plan` / `summary` / `matcher`. Thin list items add
// `has_places` / `has_day_plan` / `has_itinerary` / `awaiting` /
// `has_recommendation` and a `travel_window`. These helpers are pure
// formatters over that shape — no cross-source derivation.

export function hasContext(trip) {
  return (trip?.context_recap?.length || 0) > 0;
}

// True once an itinerary has been generated. A full TripView signals it with
// `summary != null`; a thin list item with `has_itinerary`.
export function isItineraryReady(trip) {
  return !!(trip?.has_itinerary || trip?.summary);
}

// A freshly created trip with no traveler input yet — not a real trip for
// landing / My Trips purposes.
export function isTripEmpty(trip) {
  return (trip?.lifecycle?.stage ?? 'new') === 'new' && !hasContext(trip);
}

export function isCompletedTrip(trip) {
  return trip?.lifecycle?.stage === 'done';
}

// The traveler's confirmed destination, from the composed context recap.
export function contextDestination(trip) {
  return trip?.context_recap?.find(item => item.key === 'destinations')?.value || null;
}

// Bare display strings for the recap pill rows — the composer already
// formatted each value; this only drops the destination (rendered
// elsewhere) and prefixes the origin.
export function contextRecapPills(trip) {
  return (trip?.context_recap || [])
    .filter(item => item.key !== 'destinations')
    .map(item => (item.key === 'origin_city' ? `From ${item.value}` : item.value));
}

const STAGE_BADGES = {
  new: { cls: 'b-new', text: 'New' },
  matching: { cls: 'b-chat', text: 'In conversation' },
  recommended: { cls: 'b-reco', text: 'Recommendations ready' },
  matched: { cls: 'b-matched', text: 'Destination chosen' },
  planning: { cls: 'b-matched', text: 'Planning in progress' },
  plan_ready: { cls: 'b-reco', text: 'Plan drafted' },
  planned: { cls: 'b-done', text: 'Plan ready' },
  booked: { cls: 'b-done', text: 'Booked' },
  done: { cls: 'b-done', text: 'Completed' },
};

export function stageBadge(trip) {
  const stage = trip?.lifecycle?.stage ?? 'new';
  if (isItineraryReady(trip) && stage !== 'done') return { cls: 'b-done', text: 'Itinerary ready' };
  if (stage === 'new' && hasContext(trip)) return { cls: 'b-chat', text: 'In conversation' };
  return STAGE_BADGES[stage] || STAGE_BADGES.new;
}

const STAGE_CTA = {
  new: { label: 'Start planning', to: '/' },
  matching: { label: 'Resume matching', to: '/scout-chat' },
  recommended: { label: 'Review recommendations', to: '/destinations' },
  matched: { label: 'Review recommendations', to: '/destinations' },
  planning: { label: 'Resume planning', to: '/scout-chat' },
  plan_ready: { label: 'Resume plan builder', to: '/trip-preview' },
  planned: { label: 'View trip', to: '/dashboard' },
  booked: { label: 'View trip', to: '/dashboard' },
  done: { label: 'View trip', to: '/dashboard' },
};

// Stages where a recommendation list already exists and is ready to review —
// shared so dashboardTracks.js's route track doesn't hardcode this set again.
export const RECOMMENDATIONS_READY_STAGES = new Set(['recommended', 'matched']);

export function stageCta(trip) {
  const stage = trip?.lifecycle?.stage ?? 'new';
  if (isItineraryReady(trip)) return { label: 'View trip', to: '/dashboard' };
  if (stage === 'new' && hasContext(trip)) return { label: 'Resume chat', to: '/scout-chat' };
  // planning/matching route by whether the stage's defining artifact
  // actually exists yet (day_plan / a recommendation round), not by stage
  // string alone.
  if ((stage === 'planning' || stage === 'plan_ready') && trip?.has_day_plan) {
    return { label: 'Resume plan builder', to: '/trip-preview' };
  }
  if (stage === 'matching' && trip?.has_recommendation) {
    return { label: 'Continue refining', to: '/destinations' };
  }
  return STAGE_CTA[stage] || STAGE_CTA.new;
}

// TWM-184: an honest, one-line current-status string for a My Trips card.
// Reads only the cheap list-summary flags — never triggers a full fetch.
export function tripStatusLine(trip) {
  if (isItineraryReady(trip)) return 'Your full trip plan is ready to book and go.';
  if (trip?.lifecycle?.stage === 'done') return 'This trip has wrapped up.';

  const destination = contextDestination(trip);
  if (!destination) {
    return hasContext(trip) ? "Still figuring out where you're headed." : 'Just getting started.';
  }
  if (trip?.has_day_plan) return 'A full day-by-day plan is set — sorting out bookings next.';
  if (trip?.has_places) return 'Places picked — building the day-by-day plan.';
  if (trip?.awaiting) return "Guide's working out the details with you.";
  return 'Destination settled — planning not started yet.';
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function relativeUpdatedAt(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'just now';
  if (diff < HOUR_MS) return 'updated just now';
  if (diff < DAY_MS) return `updated ${Math.floor(diff / HOUR_MS)}h ago`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 30) return `updated ${days}d ago`;
  return `updated ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
}
