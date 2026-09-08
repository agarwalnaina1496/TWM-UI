// Route/entity derivation from the enriched GET /trips/{id}/itinerary
// document (TWM-221). This module legitimately reads the enriched-itinerary
// shape — it is allow-listed in the read-model boundary fitness function
// (tests/unit/architecture/read-model-boundary.test.js): the enriched
// itinerary is a self-describing document, not raw trip_state.

// A stable cache/identity key for a resolved leg.
export function legKey(leg) {
  return `${leg.from}→${leg.to}`;
}

// A stay-drawer subject from an enriched `stay_segments[]` entry — the
// Backend resolved this segment's check-in/check-out and their source, so
// the drawer never does date math.
export function stayFromSegment(segment) {
  if (!segment) return null;
  return {
    id: segment.id,
    location: segment.location,
    nights: segment.nights,
    departureDate: segment.checkin_date ?? null,
    checkoutDate: segment.checkout_date ?? null,
    datePrecision: segment.date_precision ?? null,
    departureMonth: segment.month ?? null,
    dateSource: segment.date_source ?? null,
    startDayNumber: segment.start_day_number,
    boardItemIds: segment.board_item_ids || [],
  };
}

// A transport-drawer `leg` from an enriched gateway TRAVEL item — the item
// already carries its resolved date + precision.
export function legFromItem(item) {
  return {
    from: item.from_city,
    to: item.to_city,
    departureDate: item.date_precision === 'exact' ? item.resolved_date : null,
    departureMonth: item.date_precision === 'month' ? item.resolved_date : null,
  };
}

// Normalize an enriched entity (timeline item or stay segment) to the flat
// { id, date_source, precision, date, month } shape `searchPrefFor` reads.
export function normalizePrefEntity(entity, type) {
  if (!entity) return null;
  if (type === 'stay') {
    return {
      id: entity.id,
      date_source: entity.date_source,
      precision: entity.date_precision,
      date: entity.checkin_date,
      month: entity.month,
    };
  }
  return {
    id: entity.id,
    date_source: entity.date_source,
    precision: entity.date_precision,
    date: entity.date_precision === 'exact' ? entity.resolved_date : null,
    month: entity.date_precision === 'month' ? entity.resolved_date : null,
  };
}

export function travelerPartyLabel(party) {
  const parts = [];
  for (const [count, singular, plural] of [
    [party.adults, 'adult', 'adults'],
    [party.children, 'child', 'children'],
    [party.infants, 'infant', 'infants'],
  ]) {
    if (count) parts.push(`${count} ${count === 1 ? singular : plural}`);
  }
  return parts.join(', ') || '1 adult';
}
