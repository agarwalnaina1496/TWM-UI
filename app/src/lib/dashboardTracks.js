// TWM-182/TWM-220: the pre-freeze Overview split — a per-state "your trip so
// far" recap and the actionable next step. Reads a full `TripView`
// (lifecycle / context_recap / plan) — one shape now, no full-vs-thin
// planner branch.

import { contextDestination, stageCta } from './tripLifecycle.js';
import { DISCOVER_STAGES } from '../constants/tripStages.js';

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

// TWM-234: in Discover (matching/recommended/matched) a destination in the
// recap is a *selection*, not a committed route -- the traveler can still
// compare other destinations or hit "Plan this trip". Treating it as done
// left `matched` with no CTA, so nothing embedded and Overview rendered
// blank. Route is only done once the trip has left Discover.
function routeTrack(view) {
  const destination = contextDestination(view);
  if (destination && !DISCOVER_STAGES.has(view?.lifecycle?.stage)) {
    return { status: 'done', label: destination, cta: null };
  }
  const cta = stageCta(view);
  return { status: 'progress', label: cta.label, cta };
}

function dayPlanTrack(view) {
  const destination = contextDestination(view);
  if (!destination) return { status: 'pending', label: 'Not started', cta: null };

  const progress = plannerProgress(view);
  if (progress.hasDayPlan) {
    if (progress.frozen) {
      return { status: 'done', label: `${progress.dayCount}-day plan approved`, cta: null };
    }
    return { status: 'progress', label: 'Draft ready for review', cta: stageCta(view) };
  }
  if (progress.known) {
    return { status: 'progress', label: 'Scout is gathering trip details', cta: stageCta(view) };
  }
  return { status: 'pending', label: 'Not started', cta: null };
}

function unavailableTrack() {
  return { status: 'pending', label: 'Available once your itinerary is ready', cta: null };
}

// TWM-232: a plain fact now, not an actionable row -- the one action for an
// unsettled destination lives at the bottom of the tab (dashboardPrimaryCta),
// not duplicated here too, so no `cta` field to carry.
export function destinationFactRow(view) {
  const track = routeTrack(view);
  return { label: 'Destination', value: track.status === 'done' ? track.label : null };
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
// list); this drops destination (its own row) and budget (TWM-232 --
// TripHero's stat-tile grid already shows the traveler's stated budget
// pre-plan, "Not set yet" when missing; showing it again here would just
// repeat TripHero verbatim).
export function contextFactRows(view) {
  return (view?.context_recap || [])
    .filter(item => item.key !== 'destinations' && item.key !== 'budget')
    .map(item => ({ label: item.label, value: item.value }));
}
