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
// TWM-215: no longer takes boardDays -- those per-day dates are computed
// from booking_setup.start (exact booking-precision), not from anything
// Atlas actually planned around. Preferring them here made TripHero silently
// switch from Atlas's own planning-window label to a booking-precision
// value the moment a traveler set exact dates, even when those dates
// span a different number of days than trip_duration -- see TripHero's
// own comment for why booking-precision facts never belong on this
// surface at all.
export function tripDatesLabel(days, dateRangeLabel) {
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

// TWM-213: reinstated (previously removed as dead code on this PR, then
// needed again) as the honest-display fallback source ahead of the raw
// trip_context.num_travelers string. Atlas already resolves a qualitative
// answer like "couple" into a real number here (recording the assumption in
// assumptions[] rather than silently discarding it), so once an itinerary
// exists this is always a trustworthy approximation -- unlike parsing the
// raw conversational string client-side, which only understands digits.
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

// A booking-readiness rollup ("N of M bookable items need attention") driven
// entirely by Atlas's own per-item booking_readiness label (TWM-216 — the
// confirmed-logistics anchor concept is gone; TWM never tracks whether a
// traveler actually booked). A timeline item counts toward `total` when it
// requires_advance_booking; it's "handled" when Atlas marked it `suggested`
// (it has a concrete, low-friction suggestion), and still "open" when Atlas
// marked it `needs_advance_booking` or `unresolved`.
export function bookingReadinessRollup(days) {
  const bookableItems = (days || []).flatMap(day =>
    (day.timeline || []).filter(item => item.requires_advance_booking)
  );
  const ready = bookableItems.filter(item => item.booking_readiness === 'suggested').length;
  return { ready, total: bookableItems.length };
}
