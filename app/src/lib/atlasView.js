// Pure view-model helpers for rendering a real AtlasResponse (twm/schemas/atlas.py)
// on the Trip Dashboard. No mock fixtures, no local persistence.

const TIMELINE_ICONS = { TRAVEL: '🚗', STAY: '🏨', MEAL: '🍽️', ACTIVITY: '📍', FREE_TIME: '🕒' };

export function timelineIcon(kind) {
  return TIMELINE_ICONS[kind] || '📍';
}

// Prefers real per-day dates when Atlas has them, falls back to the trip's
// travel-window label (e.g. "October"), and only falls back to a plain day
// count when neither is known yet. The label itself adapts too — "Travel
// month" when all we have is a month/window, "Trip dates" otherwise.
export function tripDatesLabel(days, dateRangeLabel) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (first) return { label: 'Trip dates', value: first === last ? first : `${first} – ${last}` };
  if (dateRangeLabel) return { label: 'Travel month', value: dateRangeLabel };
  return { label: 'Trip dates', value: `${days.length} day${days.length === 1 ? '' : 's'}` };
}

const BOOKING_READINESS_LABEL = {
  suggested: 'Suggested',
  needs_advance_booking: 'Needs advance booking',
  unresolved: 'Readiness unresolved',
};

export function bookingReadinessLabel(status) {
  return BOOKING_READINESS_LABEL[status] || status;
}

export function dayCostRange(day) {
  return (day.timeline || []).reduce(
    (range, item) => ({
      low: range.low + (item.estimated_cost_low ?? 0),
      high: range.high + (item.estimated_cost_high ?? 0),
    }),
    { low: 0, high: 0 },
  );
}

// Ordered, deduped (consecutive) list of route stops across all days, each
// carrying the day numbers spent there — the real Atlas contract has no
// coordinates, so the Map tab shows route order only, not a visual map.
export function routeStops(days) {
  const stops = [];
  for (const day of days || []) {
    const last = stops[stops.length - 1];
    if (last && last.location === day.primary_location) {
      last.dayNumbers.push(day.day_number);
    } else {
      stops.push({ location: day.primary_location, dayNumbers: [day.day_number] });
    }
  }
  return stops;
}

export function dayRangeLabel(dayNumbers) {
  if (dayNumbers.length === 1) return `Day ${dayNumbers[0]}`;
  return `Day ${dayNumbers[0]}–${dayNumbers[dayNumbers.length - 1]}`;
}

// Confirmed logistics anchors (application-owned, twm/schemas/logistics.py)
// are shown as their own list — never fuzzy-matched onto specific Atlas
// timeline items, which have no stable identity across regenerations.
export function anchorsForDay(anchors, dayNumber) {
  return (anchors || []).filter(anchor => anchor.day_number === dayNumber);
}

export function anchorsByType(anchors, type) {
  return (anchors || []).filter(anchor => anchor.type === type);
}
