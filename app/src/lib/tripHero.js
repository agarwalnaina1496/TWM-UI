// DashboardHome's hero-selection + discover-only classification (TWM-172).
// TWM-220: the month heuristic that used to parse `trip_context` free text
// client-side is gone — a list item now carries a server-composed
// `travel_window` ({ precision, departure?, month? } or null), the
// structured half of `TripView.summary.dates`.

const DISCOVER_ONLY_STAGES = new Set(['matching', 'recommended']);

// A trip "counts" for hero ranking (and the regular committed list) only
// once a destination has been chosen — stage 'matched' and beyond. Earlier
// stages are browsing-only and belong in the explore rail.
export function isDiscoverOnly(trip) {
  const stage = trip?.lifecycle?.stage ?? 'new';
  const hasContext = (trip?.context_recap?.length || 0) > 0;
  if (stage === 'new') return hasContext;
  return DISCOVER_ONLY_STAGES.has(stage);
}

// First day of the trip's travel window, from the composed `travel_window`.
// `null` when nothing confidently interpretable was said — such a trip
// never competes for the hero slot but still appears in the regular list.
function travelWindowDate(trip) {
  const window = trip?.travel_window;
  if (!window) return null;
  if (window.precision === 'exact' && window.departure) return new Date(`${window.departure}T00:00:00`);
  if (window.precision === 'month' && window.month) {
    const [year, month] = window.month.split('-').map(Number);
    if (year && month) return new Date(year, month - 1, 1);
  }
  return null;
}

function isSameMonth(date, now) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

// Ranks committed, non-completed trips: one whose window is the current
// month wins outright ("ongoing"); otherwise the nearest future month wins;
// a trip with no parseable window never wins. Returns null when nothing
// qualifies — the hero section is then absent entirely, never a placeholder.
export function selectHeroTrip(trips, now = new Date()) {
  let ongoing = null;
  let nearestUpcoming = null;
  let nearestUpcomingDate = null;

  for (const t of trips) {
    const parsed = travelWindowDate(t);
    if (!parsed) continue;
    if (isSameMonth(parsed, now)) {
      if (!ongoing) ongoing = t;
      continue;
    }
    if (parsed > now && (!nearestUpcomingDate || parsed < nearestUpcomingDate)) {
      nearestUpcoming = t;
      nearestUpcomingDate = parsed;
    }
  }

  return ongoing || nearestUpcoming || null;
}
