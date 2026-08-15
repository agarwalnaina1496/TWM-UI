import { routeStops } from './atlasView.js';

// TWM-176: booking mock data built directly against the real Atlas schema
// shape (primary_location, day_number, timeline, kind, requires_advance_booking)
// — deliberately NOT reusing mockAtlasTrip.js's structurally different shape
// (cost_inr, base, number, items). Search/ranking/reasoning here are
// permanent; only the terminal action (external "Check ↗" today vs. "Book &
// pay" once TWM-143/live inventory lands) changes later — no rework needed
// at that transition.

export const MODES = ['flight', 'train', 'bus', 'drive'];
const MODE_LABEL = { flight: 'Flight', train: 'Train', bus: 'Bus', drive: 'Drive' };
export function modeLabel(mode) {
  return MODE_LABEL[mode] || mode;
}

// Illustrative placeholder bands per mode — not derived from any real
// distance/route calculation. Replaced wholesale once TWM-143 lands.
const MODE_TEMPLATE = {
  flight: { durationHours: 2, priceLow: 6000, priceHigh: 12000 },
  train: { durationHours: 6, priceLow: 1200, priceHigh: 3000 },
  bus: { durationHours: 14, priceLow: 800, priceHigh: 1800 },
  drive: { durationHours: 5, priceLow: 3000, priceHigh: 6000 },
};

function searchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function transportOptionsFor(leg) {
  return MODES.map(mode => ({
    mode,
    name: `${modeLabel(mode)}: ${leg.from} → ${leg.to}`,
    ...MODE_TEMPLATE[mode],
    url: searchUrl(`${leg.from} to ${leg.to} ${mode}`),
  }));
}

// Mode-filter: only feasible modes are returned at all — infeasible modes
// are genuinely absent (in `excluded`, for the explanatory note), never
// rendered faded. A long-haul mode (e.g. a >12h bus) isn't practical
// against a short trip.
export function feasibleTransportOptions(options, { tripDurationDays }) {
  const ceilingHours = tripDurationDays <= 5 ? 12 : 24;
  const feasible = [];
  const excluded = [];
  for (const option of options) {
    if (option.durationHours > ceilingHours) {
      excluded.push({ ...option, reason: `${modeLabel(option.mode)} excluded — a ${option.durationHours}h journey isn't practical for a ${tripDurationDays}-day trip.` });
    } else {
      feasible.push(option);
    }
  }
  return { feasible, excluded };
}

// Transport legs: consecutive primary_location changes across days, PLUS
// the origin<->destination bookend legs — the old Logistics page showed
// only local transfers between stops and dropped the actual origin leg
// entirely.
export function transportLegs(days, origin) {
  const stops = routeStops(days);
  if (stops.length === 0) return [];
  const originLabel = origin || 'Home';
  const legs = [{ id: 'outbound-origin', from: originLabel, to: stops[0].location }];
  for (let i = 0; i < stops.length - 1; i++) {
    legs.push({ id: `leg-${i}`, from: stops[i].location, to: stops[i + 1].location });
  }
  legs.push({ id: 'return-origin', from: stops[stops.length - 1].location, to: originLabel });
  return legs;
}

// A round trip bundles as one priced decision, not two separate one-way
// resolves — true whenever the traveler ends up back where they started
// (the first leg's origin equals the last leg's destination), regardless
// of how many different cities sit in between on a multi-stop circuit.
export function bundleRoundTrip(legs) {
  if (legs.length < 2) return { bundle: null, rest: legs };
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first.from === last.to) {
    return { bundle: { id: 'round-trip', outbound: first, inbound: last }, rest: legs.slice(1, -1) };
  }
  return { bundle: null, rest: legs };
}

export function stayLegs(days) {
  return routeStops(days).map(stop => ({ id: `stay-${stop.location}`, location: stop.location, nights: stop.dayNumbers.length }));
}

const STAY_TIERS = [
  { fit: 'Value-oriented base', priceLow: 1500, priceHigh: 2500 },
  { fit: 'Mid-range comfort', priceLow: 2800, priceHigh: 4200 },
  { fit: 'Higher-budget option', priceLow: 5000, priceHigh: 9000 },
];

export function stayOptionsFor(stay) {
  return STAY_TIERS.map(tier => ({
    name: `${stay.location} — ${tier.fit}`,
    ...tier,
    url: searchUrl(`hotels in ${stay.location}`),
  }));
}

// Activity bookings are never mock — only real Atlas-flagged items, the
// exception for that day, not the norm.
export function activityBookings(days) {
  return (days || []).flatMap(day =>
    (day.timeline || [])
      .filter(item => item.kind === 'ACTIVITY' && item.requires_advance_booking)
      .map(item => ({ id: `activity-${day.day_number}-${item.title}`, dayNumber: day.day_number, title: item.title, detail: item.detail }))
  );
}

// Never a bare status word — states exactly what's missing.
export function notBookedYetLabel(name) {
  return `${name} not booked yet`;
}
