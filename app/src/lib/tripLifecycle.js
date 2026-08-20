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
  // TWM-183: Meridian's own extraction sometimes lands here (not `origin`),
  // e.g. the known-destination entry path — was previously invisible to
  // every RECAP_FIELDS-based caller (My Trips cards, the fallback recap
  // below) whenever a trip's origin only existed under this key.
  ['origin_city', value => `From ${value}`],
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
  recommended: { cls: 'b-reco', text: 'Recommendations ready' },
  matched: { cls: 'b-matched', text: 'Destination chosen' },
  planning: { cls: 'b-matched', text: 'Planning in progress' },
  plan_ready: { cls: 'b-reco', text: 'Plan drafted' },
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
  recommended: { label: 'Review recommendations', to: '/destinations' },
  matched: { label: 'Review recommendations', to: '/destinations' },
  planning: { label: 'Resume planning', to: '/trip-preview' },
  plan_ready: { label: 'Resume plan builder', to: '/trip-preview' },
  planned: { label: 'View trip', to: '/dashboard' },
  booked: { label: 'View trip', to: '/dashboard' },
  done: { label: 'View trip', to: '/dashboard' },
};

// Stages where a recommendation list already exists and is ready to review
// (STAGE_CTA's own recommended/matched -> /destinations grouping) — shared
// so dashboardTracks.js's route track doesn't hardcode this stage set a
// second time (TWM-188 item 5).
export const RECOMMENDATIONS_READY_STAGES = new Set(['recommended', 'matched']);

// Stage-aware CTA for the landing resolver's single-trip resume path and any
// other stage-derived link. NOTE: Dashboard-home's own trip card (TWM-171)
// deliberately does NOT use this — it always renders a fixed "Open trip →"
// label routed to /dashboard regardless of stage, hardcoded at that call
// site rather than folded in here, since this lookup's per-stage distinction
// is real reusable logic other callers may still want.
export function stageCta(tripState) {
  const stage = tripState?.stage ?? 'new';
  if (isItineraryReady(tripState)) return { label: 'View trip', to: '/dashboard' };
  if (stage === 'new' && hasTripContext(tripState)) return { label: 'Resume chat', to: '/scout-chat' };
  return STAGE_CTA[stage] || STAGE_CTA.new;
}

// A destination reads as "known" from either path: Discover ends with
// trip_context.selected_option once a recommendation is chosen (TWM-153),
// known-destination entry sets trip_context.destinations directly and never
// touches selected_option (JourneyEntry.jsx). Mirrors dashboardTracks.js's
// own routeDestinationName — kept as a separate, tiny copy here rather than
// an import, since that module is Dashboard-track-board-specific and this
// one is a general My Trips/landing helper; duplicating one three-line check
// beats a cross-module coupling neither side otherwise needs.
function knownDestinationName(tripContext) {
  if (tripContext?.selected_option?.name) return tripContext.selected_option.name;
  const destinations = tripContext?.destinations;
  if (Array.isArray(destinations) && destinations.length > 0) return destinations.join(', ');
  return null;
}

// TWM-184: an honest, one-line current-status string for a My Trips card —
// deliberately prose, not a fixed-slot/track-dot indicator. A fixed-count
// visual was built and explicitly rejected during mockup work for reading
// like "step X of 4," the forced-pipeline framing this whole redesign exists
// to avoid. Reads only the cheap list-summary fields already on every trip
// record (`awaiting`/`has_day_plan`/`has_places`, added in TWM-182 Part C) —
// never triggers a full per-trip fetch just to render a card.
//
// Deliberately worded to never contain any STAGE_BADGES/isItineraryReady
// badge text as a substring (Playwright's text matcher is case-insensitive
// substring by default, and both the badge and this line render on the same
// card) — confirmed the hard way: "Itinerary ready — everything in one
// place." broke `getByText('Itinerary ready')` in the e2e suite by matching
// both the badge and this line at once.
export function tripStatusLine(tripState) {
  if (isItineraryReady(tripState)) return 'Your full trip plan is ready to book and go.';
  if (tripState?.stage === 'done') return 'This trip has wrapped up.';

  const destination = knownDestinationName(tripState?.trip_context) || contextDestination(tripState?.trip_context);
  if (!destination) {
    return hasTripContext(tripState) ? "Still figuring out where you're headed." : 'Just getting started.';
  }
  if (tripState?.has_day_plan) return 'A full day-by-day plan is set — sorting out bookings next.';
  if (tripState?.has_places) return 'Places picked — building the day-by-day plan.';
  if (tripState?.awaiting) return "Guide's working out the details with you.";
  return 'Destination settled — planning not started yet.';
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// TWM-184: "updated Xh/Xd ago" for My Trips cards — relative for anything
// recent enough to matter (under 30 days), falls back to an absolute date
// beyond that rather than ballooning into "2 months ago"/"1 year ago" math.
export function relativeUpdatedAt(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'just now'; // clock skew guard
  if (diff < HOUR_MS) return 'updated just now';
  if (diff < DAY_MS) return `updated ${Math.floor(diff / HOUR_MS)}h ago`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 30) return `updated ${days}d ago`;
  return `updated ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
}
