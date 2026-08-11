// Pure view-model helpers for rendering a real AtlasResponse (twm/schemas/atlas.py)
// on the Trip Dashboard. No mock fixtures, no local persistence.

const TIMELINE_ICONS = { TRAVEL: '🚗', STAY: '🏨', MEAL: '🍽️', ACTIVITY: '📍', FREE_TIME: '🕒' };

export function timelineIcon(kind) {
  return TIMELINE_ICONS[kind] || '📍';
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

// Ordered, deduped (consecutive) list of primary locations across all days —
// the real Atlas contract has no coordinates, so the Map tab shows route
// order only, not a visual map.
export function routeLocations(days) {
  const locations = [];
  for (const day of days || []) {
    if (locations[locations.length - 1] !== day.primary_location) {
      locations.push(day.primary_location);
    }
  }
  return locations;
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
