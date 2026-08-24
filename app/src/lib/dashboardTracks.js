// TWM-182: the 4-track board (Route / Day plan / Bookings / Documents —
// Budget explicitly excluded) and the per-state Overview split shown on any
// trip that hasn't reached a frozen, itinerary-ready plan yet. Reads only
// canonical trip_state fields, mirrors tripLifecycle.js's stage/CTA style.
// TWM-188 item 5: the route track's stage grouping is imported from
// tripLifecycle.js rather than duplicated here as a second hardcoded
// literal-string check.

import { TRIP_CONTEXT_KEYS } from '../constants/tripContext.js';
import { RECOMMENDATIONS_READY_STAGES, contextDestination, tripContextFacts } from './tripLifecycle.js';

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

function routeTrack(tripState) {
  const tripContext = tripState?.trip_context;
  const destination = contextDestination(tripContext);
  if (destination) return { status: 'done', label: destination, cta: null };

  // Unknown-destination path: still gathering vs. recommendations already
  // in hand — mirrors STAGE_CTA's own recommended/matched vs. earlier split.
  const stage = tripState?.stage ?? 'new';
  if (RECOMMENDATIONS_READY_STAGES.has(stage)) {
    return { status: 'progress', label: 'Recommendations ready', cta: { label: 'Review recommendations', to: '/destinations' } };
  }
  // TWM-190: a "matching" trip can rest at that stage either mid-fresh-
  // conversation, or awaiting clarification on a refinement round that
  // already produced a prior recommendation list — the second case belongs
  // on /destinations (where its composers live), not a fresh chat window.
  // has_recommendation only ever exists on the thin GET /trips summary
  // shape (matcher_recommendations is a separate table, never embedded in
  // trip_state the way planner_state's day_plan is) — a full single-trip
  // fetch has no equivalent signal here, so this branch is exact for
  // summary-shaped tripState and best-effort (defaults to the chat CTA)
  // for a full-fetch one. In practice this path is unreached today, since
  // a matching-stage trip never routes through TripDashboard.jsx (it's
  // still discover-only, rendered via DashboardHome's Explore rail).
  if (stage === 'matching' && tripState?.has_recommendation) {
    return { status: 'progress', label: 'Refining recommendations', cta: { label: 'Continue refining', to: '/destinations' } };
  }
  return { status: 'progress', label: 'Discovering your destination', cta: { label: 'Continue chat', to: '/scout-chat' } };
}

function dayPlanTrack(tripState) {
  const destination = contextDestination(tripState?.trip_context);
  if (!destination) return { status: 'pending', label: 'Not started', cta: null };

  const progress = plannerProgress(tripState);
  if (progress.hasDayPlan) {
    if (progress.frozen) {
      return { status: 'done', label: `${progress.dayCount}-day plan approved`, cta: null };
    }
    return { status: 'progress', label: 'Draft ready for review', cta: { label: 'Resume in Plan Builder', to: '/trip-preview' } };
  }
  if (progress.known) {
    // TWM-190: still-gating (no day_plan yet) chat lives on /scout-chat now,
    // not /trip-preview — that page is Plan Builder only once a plan exists.
    return { status: 'progress', label: 'Guide is gathering trip details', cta: { label: 'Continue chat', to: '/scout-chat' } };
  }
  return { status: 'pending', label: 'Not started', cta: null };
}

// Bookings/Documents content only ever populates once Atlas has generated
// the detailed itinerary (TripDashboard's own boot gate) — always pending
// here, never a broken/empty tab, since this board only renders pre-freeze.
function unavailableTrack() {
  return { status: 'pending', label: 'Available once your itinerary is ready', cta: null };
}

// TWM-182: "Your trip so far"'s Destination row — a fixed row, always last,
// that either shows the settled destination or a stage-aware CTA to go pick
// one. Reuses routeTrack's own done/CTA split so this never drifts from the
// (now-removed) Route track card's logic.
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

// "Your trip so far" — the data-table recap (Origin/Dates/Duration/No. of
// travelers/Budget rows), distinct from Destinations'/My Trips' pill-based
// contextRecapPills: labeled rows instead of bare formatted strings.
// Label order/wording is this screen's own presentation choice; the field
// names and raw-value formatting come from tripContextFacts (the one
// canonical trip_context list) — travel_dates already accepts any verbatim
// form (a month, a range, "flexible"), so Duration and Dates are just two
// independent facts now, never mutually exclusive.
const FACT_LABELS = {
  [TRIP_CONTEXT_KEYS.ORIGIN_CITY]: 'Origin',
  [TRIP_CONTEXT_KEYS.TRAVEL_DATES]: 'Dates',
  [TRIP_CONTEXT_KEYS.TRIP_DURATION]: 'Duration',
  [TRIP_CONTEXT_KEYS.NUM_TRAVELERS]: 'No. of travelers',
  [TRIP_CONTEXT_KEYS.BUDGET]: 'Budget',
};

export function contextFactRows(tripContext) {
  return tripContextFacts(tripContext)
    .filter(fact => fact.key !== TRIP_CONTEXT_KEYS.DESTINATIONS)
    .map(fact => ({
      label: FACT_LABELS[fact.key],
      // The "No. of travelers" label already says what the number counts —
      // unlike the pill/facts-panel formats (no separate label), this row
      // doesn't repeat "traveler(s)" in the value too.
      value: fact.key === TRIP_CONTEXT_KEYS.NUM_TRAVELERS ? String(tripContext[fact.key]) : fact.value,
    }));
}
