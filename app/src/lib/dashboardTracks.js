// TWM-182: the 4-track board (Route / Day plan / Bookings / Documents —
// Budget explicitly excluded) and the per-state Overview split shown on any
// trip that hasn't reached a frozen, itinerary-ready plan yet. Reads only
// canonical trip_state fields, mirrors tripLifecycle.js's stage/CTA style.

// Normalizes planner progress from either shape TripDashboard's tripState
// can carry: the full single-trip fetch's nested planner_state
// (conversation_context.awaiting, day_plan, places, frozen_plan — from
// GET /trips/{id}), or the cheap list-summary's flat awaiting/has_day_plan/
// has_places (from GET /trips — TWM-182's TripContext.viewTrip renders the
// thin state straight off this, before any full fetch). A summary-shaped
// trip never reaches `frozen` here — an itinerary-ready trip always gets a
// full fetch first (see viewTrip), since the summary has no frozen_plan.
function plannerProgress(tripState) {
  const plannerState = tripState?.planner_state;
  if (plannerState) {
    return {
      known: true,
      awaiting: plannerState.conversation_context?.awaiting ?? null,
      hasDayPlan: (plannerState.day_plan?.length || 0) > 0,
      dayCount: plannerState.day_plan?.length || 0,
      frozen: !!plannerState.frozen_plan,
    };
  }
  if (tripState && ('awaiting' in tripState || 'has_day_plan' in tripState || 'has_places' in tripState)) {
    return {
      known: true,
      awaiting: tripState.awaiting ?? null,
      hasDayPlan: !!tripState.has_day_plan,
      dayCount: null,
      frozen: false,
    };
  }
  return { known: false, awaiting: null, hasDayPlan: false, dayCount: 0, frozen: false };
}

// A destination reads as "known" from either path: Discover ends with
// trip_context.selected_option once a recommendation is chosen (TWM-153),
// known-destination entry sets trip_context.destinations directly and never
// touches selected_option (JourneyEntry.jsx) — same distinction TripPreview
// already uses for planningEntry.
export function routeDestinationName(tripContext) {
  if (tripContext?.selected_option?.name) return tripContext.selected_option.name;
  const destinations = tripContext?.destinations;
  if (Array.isArray(destinations) && destinations.length > 0) return destinations.join(', ');
  return null;
}

function routeTrack(tripState) {
  const tripContext = tripState?.trip_context;
  const destination = routeDestinationName(tripContext);
  if (destination) return { status: 'done', label: destination, cta: null };

  // Unknown-destination path: still gathering vs. recommendations already
  // in hand — mirrors STAGE_CTA's own recommended/matched vs. earlier split.
  const stage = tripState?.stage ?? 'new';
  if (stage === 'recommended' || stage === 'matched') {
    return { status: 'progress', label: 'Recommendations ready', cta: { label: 'Review recommendations', to: '/destinations' } };
  }
  return { status: 'progress', label: 'Discovering your destination', cta: { label: 'Continue chat', to: '/scout-chat' } };
}

function dayPlanTrack(tripState) {
  const destination = routeDestinationName(tripState?.trip_context);
  if (!destination) return { status: 'pending', label: 'Not started', cta: null };

  const progress = plannerProgress(tripState);
  if (progress.hasDayPlan) {
    if (progress.frozen) {
      return { status: 'done', label: `${progress.dayCount}-day plan approved`, cta: null };
    }
    return { status: 'progress', label: 'Draft ready for review', cta: { label: 'Resume in Plan Builder', to: '/trip-preview' } };
  }
  if (progress.known) {
    return { status: 'progress', label: 'Guide is gathering trip details', cta: { label: 'Continue chat', to: '/trip-preview' } };
  }
  return { status: 'pending', label: 'Not started', cta: null };
}

// Bookings/Documents content only ever populates once Atlas has generated
// the detailed itinerary (TripDashboard's own boot gate) — always pending
// here, never a broken/empty tab, since this board only renders pre-freeze.
function unavailableTrack() {
  return { status: 'pending', label: 'Available once your itinerary is ready', cta: null };
}

// TWM-182: "Your trip so far"'s Destination row — a fixed row, always
// first, that either shows the settled destination or a stage-aware CTA to
// go pick one. Reuses routeTrack's own done/CTA split so this never drifts
// from the (now-removed) Route track card's logic.
export function destinationFactRow(tripState) {
  const track = routeTrack(tripState);
  if (track.status === 'done') return { label: 'Destination', value: track.label };
  return { label: 'Destination', cta: track.cta };
}

export function dashboardTrackStatuses(tripState) {
  return {
    route: routeTrack(tripState),
    dayPlan: dayPlanTrack(tripState),
    bookings: unavailableTrack(),
    documents: unavailableTrack(),
  };
}

// TWM-182: the mockup's bottom unified CTA — whichever track is actually
// actionable right now, so the traveler always has one obvious next step
// regardless of which track it's on. Route takes priority (nothing else
// can start until it's done); Bookings/Documents never have a CTA
// pre-freeze, so they're never candidates here.
export function dashboardPrimaryCta(tripState) {
  const tracks = dashboardTrackStatuses(tripState);
  return tracks.route.cta || tracks.dayPlan.cta || null;
}

// "Your trip so far" — the data-table recap (Destination/Origin/Dates/
// Duration/Travelers rows), distinct from Destinations'/My Trips' pill-based
// contextRecapPills: labeled rows instead of bare formatted strings, and
// budget deliberately excluded here (shown as its own chip instead, matching
// the mockup). trip_context is free-form (Scout extracts whatever field
// names fit the conversation), so a field simply doesn't appear as a row
// when absent.
const FACT_ROWS = [
  ['origin', 'Origin', value => String(value)],
  ['travel_window', 'Dates', value => String(value)],
  ['month', 'Dates', value => String(value)],
  ['dates', 'Dates', value => String(value)],
  ['duration_days', 'Duration', value => `${value} day${value === 1 ? '' : 's'}`],
  ['travelers', 'Travelers', value => String(value)],
];

export function contextFactRows(tripContext) {
  const seenLabels = new Set();
  const rows = [];
  for (const [key, label, format] of FACT_ROWS) {
    if (seenLabels.has(label)) continue; // travel_window/month/dates are alternates for the same "Dates" row
    const value = tripContext?.[key];
    if (value === undefined || value === null || value === '') continue;
    rows.push({ label, value: format(value) });
    seenLabels.add(label);
  }
  return rows;
}
