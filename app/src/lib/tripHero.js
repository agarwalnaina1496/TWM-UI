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

const DAY_MS = 24 * 60 * 60 * 1000;

function tripDays(trip) {
  const item = (trip?.context_recap || []).find(fact => fact.key === 'trip_duration' && fact.value);
  const days = item ? parseInt(item.value, 10) : NaN;
  return days > 0 ? days : 1;
}

// A trip is underway only when we can prove it: an exact departure that has
// started and whose length hasn't run out. A trip we only know the month of
// (`precision: 'month'`) can't claim that -- it is "this month" at best.
function isUnderway(trip, now) {
  const window = trip?.travel_window;
  if (window?.precision !== 'exact') return false;
  const start = travelWindowDate(trip);
  return Boolean(start) && start <= now && now < new Date(start.getTime() + tripDays(trip) * DAY_MS);
}

function isThisMonthOnly(trip, now) {
  const date = travelWindowDate(trip);
  return trip?.travel_window?.precision === 'month' && Boolean(date) && isSameMonth(date, now);
}

// The trip given the hero slot: one that is underway, else one we only know to
// be this month. A trip that is merely next up never takes it -- it belongs
// under "Upcoming trips". Null when neither exists; the hero section is then
// absent, never a placeholder.
export function selectHeroTrip(trips, now = new Date()) {
  return trips.find(t => isUnderway(t, now)) || trips.find(t => isThisMonthOnly(t, now)) || null;
}

// What the hero slot is called: "Happening now" only for a trip proven to be
// underway, otherwise "This month".
export function heroLabel(trip, now = new Date()) {
  return isUnderway(trip, now) ? 'Happening now' : 'This month';
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
