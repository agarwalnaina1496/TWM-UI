// Guide generates places and the day plan together in a single step — once
// that's happened, the traveler should land on the unified Plan Builder
// (TripPreview.jsx). TWM-220: reads `TripView.plan` (or the touched-branch
// plan on a command response). `day_plan` presence alone is the ready
// signal — a later edit can legitimately empty a day's places without
// un-generating the plan.
export function planReady(plan) {
  return (plan?.day_plan?.length || 0) > 0;
}
