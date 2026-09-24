// Maps `TripView` (plan + summary + context_recap) into what TripPreview.jsx
// renders. TWM-220: no more raw `planner_state` / `trip_context` reads.

import { contextDestination } from './tripLifecycle.js';

export function planBuilderSummary(view) {
  const plan = view?.plan || {};
  const dayPlan = plan.day_plan || [];
  const destinationLabel = view?.summary?.destinations?.join(', ') || contextDestination(view) || '';
  return {
    destinationLabel,
    destinationCount: view?.summary?.destinations?.length
      ?? (destinationLabel ? destinationLabel.split(',').length : 0),
    durationDays: view?.summary?.duration_days ?? dayPlan.length,
    placeCount: (plan.places || []).length,
    dayCount: dayPlan.length,
  };
}

