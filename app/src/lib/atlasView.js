// Pure formatting helpers for rendering the enriched Atlas itinerary
// (GET /trips/{id}/itinerary) on the Trip Dashboard. Label / icon / tone
// maps only — every cross-source fact (trip dates, traveler count, budget
// fit, open gaps, before-you-go, the trust rollup) is composed server-side
// into `TripView` now (TWM-217/TWM-220).

const TIMELINE_ICONS = { TRAVEL: '🚗', STAY: '🏨', MEAL: '🍽️', ACTIVITY: '📍', FREE_TIME: '🕒' };

export function timelineIcon(kind) {
  return TIMELINE_ICONS[kind] || '📍';
}

const BOOKING_READINESS_LABEL = {
  suggested: 'Suggested',
  needs_advance_booking: 'Needs advance booking',
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

export function dayRangeLabel(dayNumbers) {
  if (dayNumbers.length === 1) return `Day ${dayNumbers[0]}`;
  return `Day ${dayNumbers[0]}–${dayNumbers[dayNumbers.length - 1]}`;
}

const VERIFICATION_TONE = { VERIFIED: 'positive', GENERAL_GUIDANCE: 'neutral' };

export function verificationTone(status) {
  return VERIFICATION_TONE[status] || 'neutral';
}
