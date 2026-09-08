// TWM-182/TWM-220: the pre-freeze Overview split — a per-state "your trip so
// far" recap and the actionable next step. Reads a full `TripView`
// (lifecycle / context_recap / plan) — one shape now, no full-vs-thin
// planner branch.

import { RECOMMENDATIONS_READY_STAGES, contextDestination } from './tripLifecycle.js';

function plannerProgress(view) {
  const plan = view?.plan;
  // No plan branch at all -> Guide has not started.
  if (!plan) return { known: false, awaiting: null, hasDayPlan: false, dayCount: 0, frozen: false };
  return {
    known: true,
    awaiting: plan.awaiting ?? null,
    hasDayPlan: (plan.day_plan?.length || 0) > 0,
    dayCount: plan.day_plan?.length || 0,
    frozen: !!plan.frozen,
  };
}

function routeTrack(view) {
  const destination = contextDestination(view);
  if (destination) return { status: 'done', label: destination, cta: null };

  const stage = view?.lifecycle?.stage ?? 'new';
  if (RECOMMENDATIONS_READY_STAGES.has(stage)) {
    return { status: 'progress', label: 'Recommendations ready', cta: { label: 'Review recommendations', to: '/destinations' } };
  }
  if (stage === 'matching' && view?.matcher?.has_recommendation) {
    return { status: 'progress', label: 'Refining recommendations', cta: { label: 'Continue refining', to: '/destinations' } };
  }
  return { status: 'progress', label: 'Discovering your destination', cta: { label: 'Continue chat', to: '/scout-chat' } };
}

function dayPlanTrack(view) {
  const destination = contextDestination(view);
  if (!destination) return { status: 'pending', label: 'Not started', cta: null };

  const progress = plannerProgress(view);
  if (progress.hasDayPlan) {
    if (progress.frozen) {
      return { status: 'done', label: `${progress.dayCount}-day plan approved`, cta: null };
    }
    return { status: 'progress', label: 'Draft ready for review', cta: { label: 'Resume in Plan Builder', to: '/trip-preview' } };
  }
  if (progress.known) {
    return { status: 'progress', label: 'Guide is gathering trip details', cta: { label: 'Continue chat', to: '/scout-chat' } };
  }
  return { status: 'pending', label: 'Not started', cta: null };
}

function unavailableTrack() {
  return { status: 'pending', label: 'Available once your itinerary is ready', cta: null };
}

export function destinationFactRow(view) {
  const track = routeTrack(view);
  if (track.status === 'done') return { label: 'Destination', value: track.label };
  return { label: 'Destination', cta: track.cta };
}

export function dashboardTrackStatuses(view) {
  return {
    route: routeTrack(view),
    dayPlan: dayPlanTrack(view),
    bookings: unavailableTrack(),
    documents: unavailableTrack(),
  };
}

export function dashboardPrimaryCta(view) {
  const tracks = dashboardTrackStatuses(view);
  return tracks.route.cta || tracks.dayPlan.cta || null;
}

// "Your trip so far" — the labelled recap rows. Labels come straight from
// the composed context_recap now (the Backend owns the one canonical field
// list); this only drops the destination, which renders as its own row.
export function contextFactRows(view) {
  return (view?.context_recap || [])
    .filter(item => item.key !== 'destinations')
    .map(item => ({ label: item.label, value: item.value }));
}
