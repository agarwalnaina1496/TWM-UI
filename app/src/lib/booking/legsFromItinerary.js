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
// already carries its resolved date + precision, and (TWM-215) an optional
// `hubs[]` set of candidate gateway cities for a hubless endpoint.
export function legFromItem(item) {
  return {
    from: item.from_city,
    to: item.to_city,
    departureDate: item.date_precision === 'exact' ? item.resolved_date : null,
    departureMonth: item.date_precision === 'month' ? item.resolved_date : null,
    hubs: (item.hubs || []).map(hubFromEntry),
  };
}

// One enriched `hubs[]` entry -> the flat shape the drawer's hub picker reads.
// `feasibleModes` is Backend-resolved (deterministic, eager); the fare is not
// here — it loads lazily when the hub is selected (TWM-229).
export function hubFromEntry(entry) {
  return {
    city: entry.city,
    side: entry.side,
    lastMileKm: entry.last_mile_km ?? null,
    lastMileDurationMinutes: entry.last_mile_duration_minutes ?? null,
    longHaulDistanceKm: entry.long_haul_distance_km ?? null,
    feasibleModes: entry.feasible_modes || [],
  };
}

// Substitute a chosen gateway hub into the leg endpoint it serves, so a
// booking-options / flight-offer / feasibility request for a hub-resolved leg
// targets the hub city, not the hubless town. `origin`-side hubs replace
// `from`; every other hub replaces `to`.
export function legForHub(leg, hub) {
  if (!hub) return leg;
  return hub.side === 'origin' ? { ...leg, from: hub.city } : { ...leg, to: hub.city };
}

// The chosen hub for an open transport drawer: the matching candidate, or the
// first one as the default. Null when the leg is directly connected.
export function resolveSelectedHub(hubs, selectedCity) {
  if (!hubs || !hubs.length) return null;
  return hubs.find(h => h.city === selectedCity) ?? hubs[0];
}

// Everything the transport drawer needs derived from the open enriched item
// and the currently-chosen hub city: the base leg, its candidate hubs, the
// selected hub, and the hub-substituted leg the drawer actually searches.
export function transportHubState(item, selectedCity) {
  const leg = item ? legFromItem(item) : null;
  const hubs = leg?.hubs ?? [];
  const selected = resolveSelectedHub(hubs, selectedCity);
  return {
    leg,
    hubs,
    selected,
    selectedCity: selected?.city ?? null,
    effectiveLeg: leg ? legForHub(leg, selected) : null,
  };
}

// The per-drawer option-cache key: route (hub-substituted) + resolved date +
// party size. Switching hub changes the route segment, so the drawer
// re-resolves for the new hub.
export function transportCacheKey(item, hub, partyTotal) {
  if (!item) return null;
  return `${legKey(legForHub(legFromItem(item), hub))}::${item.resolved_date ?? 'flex'}::${partyTotal ?? 'p?'}`;
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
