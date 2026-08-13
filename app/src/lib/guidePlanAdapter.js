// Maps the real Backend-owned Guide `guide_state` (from planner_state.guide_session)
// into what TripPreview.jsx renders.

export function isPlanReadyForBuilder(phase) {
  return phase === 'DAY_PLAN_DRAFT' || phase === 'NEEDS_CLARIFICATION';
}

export function planBuilderSummary(guideState) {
  const dayPlan = guideState.day_plan || [];
  const placeCount = (guideState.places || []).length;
  return {
    destinations: guideState.destinations || [],
    durationDays: guideState.trip_duration ?? dayPlan.length,
    placeCount,
    dayCount: dayPlan.length,
  };
}

export function buildRemovePlaceMessage(dayNumber, place) {
  return `Remove "${place}" from Day ${dayNumber}.`;
}

export function buildAddPlaceMessage(dayNumber, place) {
  return `Add "${place}" to Day ${dayNumber}.`;
}

export function buildSetPaceMessage(pace) {
  return `Update the trip pace to: ${pace}.`;
}

export function buildSetStartDateMessage(value) {
  return value
    ? `Set the trip start date to ${value}.`
    : 'Remove the confirmed start date and keep the plan duration-only.';
}

export const UNDO_MESSAGE = 'Undo my last change and restore the previous version of the plan.';
