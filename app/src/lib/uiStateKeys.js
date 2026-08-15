// TWM-171: `ui_state` (see TripContext.jsx's updateUiState()) is a single
// flat, unnamespaced object shared by the whole app and persisted verbatim
// to the Backend. As more screens start writing "restore after refresh"
// state into it (Plan Builder's inline expansions, Dashboard Overview's
// checkpoint, Itinerary's matrix/day focus, ...), two screens picking the
// same key name would silently clobber each other.
//
// Convention: every key is dot-prefixed with the owning screen, i.e.
// `${SCREEN}.${field}` — flat (not nested), so updateUiState()'s existing
// shallow-merge patch semantics keep working unchanged. Add a new screen's
// prefix here rather than inventing another ad hoc key name at the call site.
export const UI_STATE_SCREEN = {
  DESTINATIONS: 'destinations',
  PLAN_BUILDER: 'planBuilder',
  DASHBOARD_OVERVIEW: 'dashboardOverview',
  ITINERARY: 'itinerary',
};

export function uiStateKey(screen, field) {
  return `${screen}.${field}`;
}
