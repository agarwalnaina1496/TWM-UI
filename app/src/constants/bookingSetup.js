// TWM-216/TWM-220/TWM-228: booking-search precision is no longer surfaced as
// a `booking_setup` branch on the read model. The structured party lives on
// `TripView.booking.party`; a per-entity search date is read straight off
// the enriched itinerary entity (GET /trips/{id}/itinerary), which carries
// its own `resolved_date` / `date_precision` / `date_source`.

// The current effective search date for one enriched entity (a timeline item
// or a stay segment), as { precision, date } | { precision, month } | null —
// whatever the drawer would search with right now, regardless of whether it
// came from the trip dates or an explicit per-entity override. The drawer's
// date field seeds from this. `null` only when nothing resolves a date.
export function searchPrefFor(entity) {
  if (!entity) return null;
  if (entity.precision === 'exact' && entity.date) return { precision: 'exact', date: entity.date };
  if (entity.precision === 'month' && entity.month) return { precision: 'month', month: entity.month };
  return null;
}

// Whether this entity's date is an explicit per-entity override (`set_search_pref`)
// rather than one inherited from the trip dates — the "Reset to the default
// date" affordance only makes sense for an override.
export function isSearchPrefOverride(entity) {
  return Boolean(entity && entity.date_source === 'search_pref');
}
