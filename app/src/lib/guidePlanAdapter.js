// Maps the real Backend-owned Guide `planner_state` (places, day_plan,
// conversation_context.awaiting, frozen_plan — flat, delta-merged, no
// phase field) into what TripPreview.jsx renders.

export function planBuilderSummary(tripContext, plannerState) {
  const dayPlan = plannerState?.day_plan || [];
  const placeCount = (plannerState?.places || []).length;
  return {
    destinations: tripContext?.destinations || [],
    durationDays: tripContext?.trip_duration ?? dayPlan.length,
    placeCount,
    dayCount: dayPlan.length,
  };
}

export function buildRemovePlaceMessage(place) {
  return `Remove "${place}" from the plan.`;
}

export function buildReplacePlaceMessage(place, replacement) {
  return `Replace "${place}" with "${replacement}".`;
}

export function buildSetPaceMessage(dayNumber, pace) {
  return `Make Day ${dayNumber} ${pace}.`;
}
