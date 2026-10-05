// DashboardHome's hero-selection + past-trip classification (TWM-232: My
// Trips groups by date now -- Happening now / Your trips / Past -- not by
// lifecycle stage, so there is no more discover-only-vs-committed split
// here. TWM-220: the month heuristic that used to parse `trip_context` free
// text client-side is gone -- a list item now carries a server-composed
// `travel_window` ({ precision, departure?, month? } or null), the
// structured half of `TripView.summary.dates`.

// First day of the trip's travel window, from the composed `travel_window`.
// `null` when nothing confidently interpretable was said — such a trip
// never competes for the hero slot but still appears in the regular list.
export function travelWindowDate(trip) {
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

// The trip happening now: the first one whose travel window is the current
// month. The hero is labelled "Happening now", so a trip that is merely next
// up never takes the slot -- it belongs under "Upcoming trips". Returns null
// when nothing is ongoing; the hero section is then absent, never a placeholder.
export function selectHeroTrip(trips, now = new Date()) {
  return trips.find(t => {
    const parsed = travelWindowDate(t);
    return parsed && isSameMonth(parsed, now);
  }) || null;
}

// TWM-232: a trip belongs in "Past" once its travel window has fully
// elapsed -- by date, not by lifecycle stage. `stage: "done"` never
// actually fires today (no backend concept exists yet for it), so a
// completed trip with no travel_window at all would otherwise have no way
// to ever leave the main list; checking the stage too costs nothing and
// covers that day if it ships. A trip still in its ongoing month is not
// past yet, even once the exact day has technically elapsed -- it stays in
// Happening now / Your trips until the month turns over.
export function isPastTrip(trip, now = new Date()) {
  if (trip?.lifecycle?.stage === 'done') return true;
  const date = travelWindowDate(trip);
  if (!date || isSameMonth(date, now)) return false;
  return date < now;
}
