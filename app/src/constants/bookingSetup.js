// TWM-216/TWM-220: booking-search precision is no longer surfaced as a
// `booking_setup` branch on the read model. The structured party lives on
// `TripView.booking.party`; a per-entity search date is read straight off
// the enriched itinerary entity (GET /trips/{id}/itinerary), which carries
// its own `resolved_date` / `date_precision` / `date_source`.

// The traveler-set search date for one enriched entity (a timeline item or a
// stay segment), as { precision, date } | { precision, month } | null. A
// `date_source` other than 'search_pref' means the date came from the trip
// dates (or nothing), so the edit form starts empty.
export function searchPrefFor(entity) {
  if (!entity || entity.date_source !== 'search_pref') return null;
  if (entity.precision === 'exact' && entity.date) return { precision: 'exact', date: entity.date };
  if (entity.precision === 'month' && entity.month) return { precision: 'month', month: entity.month };
  return null;
}
