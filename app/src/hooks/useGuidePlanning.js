// Guide generates places and the day plan together in a single step — once
// that's happened, the traveler should land on the unified Plan Builder
// (TripPreview.jsx), which owns freezing the plan and generating the
// detailed itinerary itself. day_plan is only ever produced alongside
// places in the same single-step turn, so its presence alone is the ready
// signal — must match TripPreview.jsx's own planReady check exactly (a
// subsequent edit can legitimately empty a day's places without
// un-generating the plan, so checking places here too would disagree).
export function planReady(plannerState) {
  return (plannerState?.day_plan?.length || 0) > 0;
}
