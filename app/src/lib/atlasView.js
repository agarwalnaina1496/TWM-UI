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
export function tripDatesLabel(days, dateRangeLabel, boardDays = []) {
  const first = boardDays[0]?.date;
  const last = boardDays[boardDays.length - 1]?.date;
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
// dates (TWM-146): additive, non-breaking alongside dayNumbers — carries
// each stop's real Atlas day.date when present (may be entirely absent, see
// tripDatesLabel above), so a caller that needs an exact calendar date (the
// flight-search payload) can read stops[i].dates[0] without re-deriving it,
// while every existing dayNumbers-only consumer is unaffected.
export function routeStops(days, boardDays = []) {
  const dateByDay = new Map(boardDays.map(day => [day.day_number, day.date]));
  const stops = [];
  for (const day of days || []) {
    const last = stops[stops.length - 1];
    if (last && last.location === day.primary_location) {
      last.dayNumbers.push(day.day_number);
      if (dateByDay.get(day.day_number)) last.dates.push(dateByDay.get(day.day_number));
    } else {
      const date = dateByDay.get(day.day_number);
      stops.push({ location: day.primary_location, dayNumbers: [day.day_number], dates: date ? [date] : [] });
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

// TWM-175: AtlasTripSummary's real field is num_travelers — TripHero used
// to read the wrong key (`travelers`), which never exists on the schema, so
// party size always silently fell back to a hardcoded default of 2.
export function travelerCount(summary) {
  return summary?.num_travelers ?? null;
}

const VERIFICATION_TONE = { VERIFIED: 'positive', GENERAL_GUIDANCE: 'neutral' };

export function verificationTone(status) {
  return VERIFICATION_TONE[status] || 'neutral';
}

// Always-visible trust-strip counts — assumptions, open (unresolved) items,
// and a verified-vs-general-guidance tally across every timeline item and
// practical note that carries a reference. Never hidden behind a closed
// disclosure (AtlasReference.status is the single biggest capability-to-UI
// mismatch the agent-capability audit found).
export function trustStripCounts(finalItinerary, result) {
  const items = (finalItinerary?.days || []).flatMap(day => day.timeline || []);
  const references = [
    ...items.map(item => item.reference),
    ...(finalItinerary?.practical_notes || []).map(note => note.reference),
  ].filter(Boolean);
  return {
    assumptionsCount: (finalItinerary?.assumptions || []).length,
    unresolvedCount: (result?.unresolved || []).length,
    verifiedCount: references.filter(ref => ref.status === 'VERIFIED').length,
    generalGuidanceCount: references.filter(ref => ref.status === 'GENERAL_GUIDANCE').length,
  };
}

// A booking-readiness rollup ("N of M bookable items ready") — a timeline
// item is bookable when it requires_advance_booking; it's "ready" once a
// confirmed logistics anchor exists for it (the real, application-owned
// signal a booking was actually handled — never inferred from Atlas's own
// booking_readiness label, which only reflects whether Atlas thinks the item
// is suggestable, not whether the traveler actually booked anything).
//
// TWM-198/TWM-209: matches an anchor to its exact item via board_item_id
// (`${tripId}:${day_number}:${timelineIndex}` — the same derivation
// twm/services/trip_board/service.py uses for TripBoardItem.id) when the
// anchor carries one, so two same-day bookable items are never confused
// with each other. Falls back to the original day-only match only for an
// anchor with no board_item_id at all (legacy anchor data, or any future
// confirm_logistics caller that doesn't send one) — never the reverse, so
// an anchor that DOES carry a board_item_id can't accidentally satisfy a
// different same-day item just because both are on that day.
export function bookingReadinessRollup(days, anchors, tripId) {
  const bookableItems = (days || []).flatMap(day =>
    (day.timeline || []).map((item, index) => ({
      ...item,
      day_number: day.day_number,
      board_item_id: `${tripId}:${day.day_number}:${index}`,
    })).filter(item => item.requires_advance_booking)
  );
  const legacyAnchors = (anchors || []).filter(anchor => !anchor.board_item_id);
  const ready = bookableItems.filter(item =>
    (anchors || []).some(anchor => anchor.board_item_id && anchor.board_item_id === item.board_item_id) ||
    anchorsForDay(legacyAnchors, item.day_number).length > 0
  ).length;
  return { ready, total: bookableItems.length };
}
