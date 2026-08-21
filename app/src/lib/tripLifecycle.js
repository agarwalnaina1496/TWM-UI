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

// The single canonical list of trip_context field names every recap/fact
// surface in this repo reads from — must mirror twm/schemas/trip_context.py's
// FIXED_KEYS + destinations exactly (name-for-name, not just conceptually).
// Renaming or adding a trip_context field means touching this list, not
// hunting down every screen that happens to render one. `format` returns
// the raw value formatted for display — never bucketed into a generic
// label, an exact persisted value or nothing, so "₹1,00,000 total for
// both" never degrades to "Flexible budget". Each consumer (My Trips
// cards, Destinations' fact panel, ScoutChat's live panel) applies its
// own label/wrapping on top of these raw values — that's legitimate
// per-screen presentation, not the duplication this list eliminates.
export const TRIP_CONTEXT_FIELDS = [
  ['destinations', value => (Array.isArray(value) ? value.join(', ') : String(value))],
  ['origin_city', value => String(value)],
  ['trip_duration', value => `${value} day${value === 1 ? '' : 's'}`],
  ['travel_dates', value => String(value)],
  ['num_travelers', value => `${value} traveler${value === 1 ? '' : 's'}`],
  ['budget', value => String(value)],
];

// {key, value}[] of every known trip_context field currently set — a
// field simply isn't included until it's actually known, never rendered
// empty/placeholder.
export function tripContextFacts(tripContext) {
  return TRIP_CONTEXT_FIELDS
    .map(([key, format]) => {
      const value = tripContext?.[key];
      return value === undefined || value === null || value === '' ? null : { key, value: format(value) };
    })
    .filter(Boolean);
}

export function contextRecapPills(tripContext) {
  return tripContextFacts(tripContext)
    .filter(fact => fact.key !== 'destinations')
    .map(fact => (fact.key === 'origin_city' ? `From ${fact.value}` : fact.value));
}

// The traveler's confirmed destination, once one exists — the one
// canonical trip_context.destinations signal, written by Backend for the
// Discover path (select_destination) and extracted by Guide itself for
// the known-destination path (twm/schemas/trip_context.py).
export function contextDestination(tripContext) {
  const destinations = tripContext?.destinations;
  return Array.isArray(destinations) && destinations.length > 0 ? destinations.join(', ') : null;
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
  planning: { label: 'Resume planning', to: '/scout-chat' },
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
  // TWM-190: planning/matching route by whether the stage's defining
  // artifact actually exists yet (day_plan / a recommendation round), not
  // by stage string alone — a "planning" trip with a day_plan is really
  // plan_ready in substance, and a "matching" trip with an existing
  // recommendation is a refinement awaiting clarification, which belongs
  // on /destinations (where its composers live) rather than a fresh chat.
  if ((stage === 'planning' || stage === 'plan_ready') && tripState?.has_day_plan) {
    return { label: 'Resume plan builder', to: '/trip-preview' };
  }
  if (stage === 'matching' && tripState?.has_recommendation) {
    return { label: 'Continue refining', to: '/destinations' };
  }
  return STAGE_CTA[stage] || STAGE_CTA.new;
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

  const destination = contextDestination(tripState?.trip_context);
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
