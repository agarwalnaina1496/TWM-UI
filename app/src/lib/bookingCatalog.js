import { routeStops } from './atlasView.js';
import { resolveTrustedAction, getTripFeasibility } from './tripApi.js';

// TWM-176/TWM-132: booking data built directly against the real Atlas
// schema shape (primary_location, day_number, timeline, kind,
// requires_advance_booking) — deliberately NOT reusing mockAtlasTrip.js's
// structurally different shape (cost_inr, base, number, items).
// Search/ranking/reasoning here (transportLegs/bundleRoundTrip/stayLegs) are
// permanent, pure route-derivation from Atlas days with no Backend
// dependency. TWM-132 is the transition promised in the old header comment:
// the terminal action (transportOptionsFor/feasibleTransportOptions/
// stayOptionsFor) now calls the real TWM-130/TWM-131 trusted-action and
// feasibility endpoints instead of returning mock MODE_TEMPLATE bands and a
// Google search URL — so every one of these is now async.

export const MODES = ['flight', 'train', 'bus', 'drive'];
const MODE_LABEL = { flight: 'Flight', train: 'Train', bus: 'Bus', drive: 'Drive' };
export function modeLabel(mode) {
  return MODE_LABEL[mode] || mode;
}

// twm/schemas/trusted_action.py's TrustedActionDomain is only
// flight/train/bus/stay — "drive has no action of any kind" (its
// feasibility is purely computed distance/routing, never a partner
// handoff, per that schema's own docstring). Modes with no domain here are
// feasibility-only: never a trusted-action network call, never a CTA.
const DOMAIN_FOR_MODE = { flight: 'flight', train: 'train', bus: 'bus' };

// Judgement call (TWM-132, documented per the story's instruction to
// "render whichever the API actually returns rather than assuming one
// path"): requesting action_type=CHECK_PRICES for domain=flight always
// resolves to internal_capability: "flight_search" (twm/services/
// trusted_action/service.py's CHECK_PRICES branch never attaches an
// external target) — and the live flight-offer UI that capability points at
// (TWM-146) is explicitly out of scope for this story, not started. Rather
// than surface a dead-end CTA today, this module requests
// action_type=SEARCH_REDIRECT for flight too (ixigo), which the backend
// contract already documents as flight's "second, alternative option" —
// giving the flight card a real, working link now. Once TWM-146 ships,
// flight's request here should switch to CHECK_PRICES as its primary path
// (with SEARCH_REDIRECT alongside it), per the contract's own framing.
const ACTION_TYPE_FOR_MODE = { flight: 'SEARCH_REDIRECT', train: 'SEARCH_REDIRECT', bus: 'SEARCH_REDIRECT' };

// Resolves one mode's trusted action into the shape TransportOptionCard
// consumes. Every backend outcome (resolved / missing_input /
// unsupported_partner / disabled, plus a network-error fallback) maps to a
// `status`, so the card can render each safely instead of assuming
// `resolved` — a hard requirement from TWM-130's status discriminator.
async function resolveTransportOption(tripId, leg, mode) {
  const name = `${modeLabel(mode)}: ${leg.from} → ${leg.to}`;
  const domain = DOMAIN_FOR_MODE[mode];
  if (!domain) {
    // drive: feasibility-only, no trusted-action domain exists.
    return { mode, name, status: 'no_action' };
  }
  try {
    const result = await resolveTrustedAction(tripId, {
      action_type: ACTION_TYPE_FOR_MODE[mode],
      domain,
      origin: leg.from,
      destination: leg.to,
    });
    return toTransportOption(mode, name, result);
  } catch (error) {
    return { mode, name, status: 'error', errorMessage: error.message || 'Could not load this option.' };
  }
}

function toTransportOption(mode, name, result) {
  if (result.status === 'resolved') {
    const action = result.action;
    return {
      mode,
      name,
      status: 'resolved',
      url: action.target?.target_url ?? null,
      internalCapability: action.internal_capability ?? null,
      affiliateDisclosure: !!action.affiliate_disclosure,
    };
  }
  return { mode, name, status: result.status };
}

// Async: resolves every mode's trusted action for one leg in parallel.
// Called from TripDashboard.jsx inside a useEffect (not synchronously
// during render — see the page's Bookings-tab loading/error state).
export async function transportOptionsFor(tripId, leg) {
  return Promise.all(MODES.map(mode => resolveTransportOption(tripId, leg, mode)));
}

// Fetches the real per-route TripFeasibilityAssessment (flight/train/bus/
// drive) for a leg. May resolve to null — the Backend has no assessment for
// this route yet — which callers must treat as "no feasibility data", not
// an error.
export async function fetchLegFeasibility(tripId, leg) {
  return getTripFeasibility(tripId, { origin: leg.from, destination: leg.to });
}

// Merges the real TripFeasibilityAssessment onto each mode's resolved
// option — duration/distance/reason now come straight from the Backend
// (already computed there), never re-synthesized client-side. A mode with
// status: ruled_out is genuinely excluded (in `excluded`, for the
// explanatory note), never rendered faded. When no assessment exists yet,
// every option is treated as feasible with no duration/reason attached.
export function feasibleTransportOptions(options, feasibility) {
  const modesByName = new Map((feasibility?.modes || []).map(entry => [entry.mode, entry]));
  const feasible = [];
  const excluded = [];
  for (const option of options) {
    const modeFeasibility = modesByName.get(option.mode);
    const enriched = modeFeasibility
      ? {
        ...option,
        durationMinutes: modeFeasibility.estimated_duration_minutes,
        distanceKm: modeFeasibility.estimated_distance_km,
        reason: modeFeasibility.reason,
        durationSource: modeFeasibility.duration_source,
        verification: modeFeasibility.verification,
        feasibilityStatus: modeFeasibility.status,
      }
      : option;
    if (modeFeasibility?.status === 'ruled_out') {
      excluded.push(enriched);
    } else {
      feasible.push(enriched);
    }
  }
  return { feasible, excluded };
}

// "Recommended mode" selection (TWM-132 — no explicit ranking rule was
// specified in the Linear description beyond "clearly best" or "only one
// feasible"). Judgement call, documented here: fixed priority order
// flight > drive > train > bus among feasible modes — flight and drive are
// Backend-computed (never an LLM estimate) and are generally the fastest
// practical options for a multi-city trip; train/bus are only preferred
// when neither faster mode is feasible. A mode only counts as
// recommendable when it actually has something actionable to show (a
// resolved trusted action, or drive's feasibility-only no_action state —
// never a missing_input/unsupported_partner/disabled/error mode, which has
// no safe CTA to recommend).
const MODE_PRIORITY = ['flight', 'drive', 'train', 'bus'];
export function recommendedMode(feasibleOptions) {
  const actionable = (feasibleOptions || []).filter(option => option.status === 'resolved' || option.status === 'no_action');
  for (const mode of MODE_PRIORITY) {
    const found = actionable.find(option => option.mode === mode);
    if (found) return found;
  }
  return null;
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

// Approved stay partners (twm/schemas/trusted_action.py's
// _ALLOWED_PARTNERS_BY_DOMAIN["stay"]), capped to 3 so the Bookings tab
// still shows a tiered comparison rather than every approved partner.
const STAY_PARTNERS = ['hotellook', 'booking_com', 'agoda'];
const PARTNER_LABEL = {
  hotellook: 'Hotellook', booking_com: 'Booking.com', agoda: 'Agoda', hostelworld: 'Hostelworld', ixigo: 'ixigo',
};

async function resolveStayOption(tripId, stay, partner) {
  const name = `${stay.location} — ${PARTNER_LABEL[partner] || partner}`;
  try {
    const result = await resolveTrustedAction(tripId, {
      action_type: 'SEARCH_REDIRECT',
      domain: 'stay',
      destination: stay.location,
      preferred_partner: partner,
    });
    if (result.status === 'resolved') {
      const action = result.action;
      return { name, status: 'resolved', url: action.target?.target_url ?? null, affiliateDisclosure: !!action.affiliate_disclosure };
    }
    return { name, status: result.status };
  } catch (error) {
    return { name, status: 'error', errorMessage: error.message || 'Could not load this option.' };
  }
}

// Async: resolves the approved stay partners in parallel for one stay leg.
// Called from TripDashboard.jsx inside a useEffect, mirroring
// transportOptionsFor.
export async function stayOptionsFor(tripId, stay) {
  return Promise.all(STAY_PARTNERS.map(partner => resolveStayOption(tripId, stay, partner)));
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
