// Pure view-model helpers for rendering a real AtlasResponse (twm/schemas/atlas.py)
// on the Trip Dashboard. No mock fixtures, no local persistence.

const TIMELINE_ICONS = { TRAVEL: '🚗', STAY: '🏨', MEAL: '🍽️', ACTIVITY: '📍', FREE_TIME: '🕒' };

export function timelineIcon(kind) {
  return TIMELINE_ICONS[kind] || '📍';
}

// The trip's travel-window label (e.g. "October") when Atlas planned around
// one, otherwise a plain day count. TripHero is an itinerary-plan summary,
// so it only ever reflects what Atlas planned around — never a
// booking-precision date a traveler later sets purely for search prefill.
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
