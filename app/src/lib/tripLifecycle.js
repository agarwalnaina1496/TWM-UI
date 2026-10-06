import { ROUTES } from '../constants/routes.js';
import { formatBudget } from './formatBudget.js';
import { DISCOVER_STAGES } from '../constants/tripStages.js';

// Canonical stage/status helpers shared by the adaptive landing resolver
// and My Trips. TWM-220: every consumer now reads a `TripView` (full) or a
// `TripListItem` (thin) — both carry `lifecycle` and `context_recap`; only
// the full view carries `plan` / `summary` / `matcher`. Thin list items add
// `has_places` / `has_day_plan` / `has_itinerary` / `awaiting` /
// `has_recommendation` and a `travel_window`. These helpers are pure
// formatters over that shape — no cross-source derivation.

export function hasContext(trip) {
  return (trip?.context_recap?.length || 0) > 0;
}

// True once an itinerary has been generated. A full TripView signals it with
// `summary != null`; a thin list item with `has_itinerary`.
export function isItineraryReady(trip) {
  return !!(trip?.has_itinerary || trip?.summary);
}

// A freshly created trip with no traveler input yet — not a real trip for
// landing / My Trips purposes.
export function isTripEmpty(trip) {
  return (trip?.lifecycle?.stage ?? 'new') === 'new' && !hasContext(trip);
}

export function isCompletedTrip(trip) {
  return trip?.lifecycle?.stage === 'done';
}

// The traveler's confirmed destination, from the composed context recap.
export function contextDestination(trip) {
  return trip?.context_recap?.find(item => item.key === 'destinations')?.value || null;
}

// TWM-232 PR 12 follow-up: the Backend's context_recap now carries every
// extracted fact, not just these 5 — right for ScoutChat's facts panel
// (a growing detail list), but a Home card is a scan surface, per PR 2's own
// call ("keep individual pills for a detail view, not this home-list scan
// surface"). Bound it back to the fixed facts a trip card was always
// designed to summarize; a free-form fact (activity preferences, considered
// destinations, ...) stays visible in the facts panel, not repeated here.
const FIXED_RECAP_KEYS = ['origin_city', 'num_travelers', 'trip_duration', 'travel_dates', 'budget'];

// Bare display strings for the recap pill rows — the composer already
// formatted each value; this only drops the destination (rendered
// elsewhere) and prefixes the origin.
export function contextRecapPills(trip) {
  return (trip?.context_recap || [])
    .filter(item => FIXED_RECAP_KEYS.includes(item.key))
    .map(item => {
      if (item.key === 'origin_city') return `From ${item.value}`;
      return `${item.label}: ${item.value}`;
    });
}

// TWM-234: while a trip is still Discovering it has no destination and, until
// a title exists, no name -- so its card is identified by what the traveler
// has actually told us. The headline is the single most telling fact so far,
// in this order: when they travel, for how long, how many, the budget. Origin
// is deliberately not a candidate: for one traveler it is the same on every
// trip, so it identifies none of them.
//
// Facts arrive as the traveler's own words ("mid to end October", "after
// Navratri (around Navami/Dashami)"), so they are tidied for display: a
// parenthetical aside is dropped and the first letter capitalised. Bare
// numbers are given their unit so a chip reads on its own ("2 travellers").
function tidy(value) {
  const cleaned = String(value).replace(/\s*\([^)]*\)/g, '').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// "3", "3 people", "3 persons", "3 pax" all read as "3 travellers".
function travellers(value) {
  const match = String(value).trim().match(/^([0-9]+)(?: *(?:people|persons?|pax|travell?ers?))?$/i);
  return match ? `${match[1]} ${match[1] === '1' ? 'traveller' : 'travellers'}` : tidy(value);
}

// Whether `text` already names `name` (case-insensitive).
export function mentions(text, name) {
  return Boolean(text && name) && String(text).toLowerCase().includes(String(name).toLowerCase());
}

const HEADLINE_FACTS = [
  { key: 'travel_dates', text: value => tidy(value) },
  { key: 'trip_duration', text: value => (/^\d+$/.test(value) ? `${value} days` : tidy(value)) },
  { key: 'num_travelers', text: travellers },
  { key: 'budget', text: value => formatBudget(value) ?? (/budget/i.test(value) ? tidy(value) : `Budget: ${tidy(value)}`) },
];

export function discoveryHeadline(trip) {
  const recap = trip?.context_recap || [];
  for (const { key, text } of HEADLINE_FACTS) {
    const item = recap.find(fact => fact.key === key && fact.value);
    if (item) return { key, text: text(String(item.value)) };
  }
  return null;
}

// The facts for a Discovering card's chips, worded compactly and in the same
// priority order as the headline, minus the fact already used as the
// headline, with the origin last (it is the least telling one).
// `shownTitle` is the title the card actually displays: a title that already
// says where the trip starts ("... from Delhi") makes the "From Delhi" chip a
// repeat, so the chip is left out.
export function discoveryPills(trip, excludeKey = null, shownTitle = null) {
  const recap = trip?.context_recap || [];
  const pills = [];
  for (const { key, text } of HEADLINE_FACTS) {
    const item = key !== excludeKey && recap.find(fact => fact.key === key && fact.value);
    if (item) pills.push(text(String(item.value)));
  }
  const origin = recap.find(fact => fact.key === 'origin_city' && fact.value);
  if (origin && !mentions(shownTitle, origin.value)) pills.push(`From ${origin.value}`);
  return pills;
}

// TWM-234: a Plan-module trip is either still being worked on (planning, or a
// draft plan waiting for review) or finished (approved plan, itinerary ready,
// booked, completed). The two get different cards -- see DashboardHome.
export function isPlanFinished(trip) {
  const stage = trip?.lifecycle?.stage;
  return isItineraryReady(trip) || stage === 'planned' || stage === 'booked' || stage === 'done';
}

// A planning card is "reviewing" once a draft day plan exists, even while the
// stage still reads `planning`.
export function isPlanDraftReady(trip) {
  const stage = trip?.lifecycle?.stage;
  return stage === 'plan_ready' || (stage === 'planning' && Boolean(trip?.has_day_plan));
}

// TWM-234: what a My Trips card says, by stage -- every stage renders the same
// card (title, facts chips, one action) and this is the only thing that varies:
//   line     the one line under the title, when there is no hero
//   eyebrow  set for the two stages that end a module's first half (matched,
//            planned): the card then shows the destination as its hero
//   cta      the single action's label; `actions: 'matched'` swaps in the two
//            matched actions instead
//   tone     'matched' | 'planned' tints a hero card
export function tripCardSpec(trip) {
  const stage = trip?.lifecycle?.stage;
  const destination = contextDestination(trip) || trip?.lifecycle?.selected_option?.name || null;
  const discovering = DISCOVER_STAGES.has(stage);
  const base = { module: discovering ? 'discovering' : 'plan', destination, emptyLabel: discovering ? 'New discovery' : 'New trip' };
  if (stage === 'matched') return { ...base, tone: 'matched', eyebrow: 'Your pick', actions: 'matched' };
  if (discovering) {
    return { ...base, line: { text: 'Destination not chosen yet' }, cta: stage === 'recommended' ? 'Review recommendations →' : 'Continue exploring →' };
  }
  if (isPlanFinished(trip)) {
    const eyebrow = stage === 'done' ? 'Completed' : stage === 'booked' ? 'Booked' : 'Plan approved';
    return { ...base, module: 'planned', tone: 'planned', eyebrow, cta: 'Open trip →' };
  }
  const draft = isPlanDraftReady(trip);
  return {
    ...base,
    line: { bold: destination, text: draft ? 'Draft plan ready to review' : 'Planning in progress' },
    cta: draft ? 'Review plan →' : 'Continue planning →',
  };
}

const STAGE_BADGES = {
  new: { cls: 'b-new', text: 'New' },
  matching: { cls: 'b-chat', text: 'In conversation' },
  recommended: { cls: 'b-reco', text: 'Recommendations ready' },
  matched: { cls: 'b-matched', text: 'Destination chosen' },
  planning: { cls: 'b-matched', text: 'Planning in progress' },
  plan_ready: { cls: 'b-reco', text: 'Plan drafted' },
  planned: { cls: 'b-done', text: 'Plan ready' },
  booked: { cls: 'b-done', text: 'Booked' },
  done: { cls: 'b-done', text: 'Completed' },
};

export function stageBadge(trip) {
  const stage = trip?.lifecycle?.stage ?? 'new';
  if (isItineraryReady(trip) && stage !== 'done') return { cls: 'b-done', text: 'Itinerary ready' };
  if (stage === 'new' && hasContext(trip)) return { cls: 'b-chat', text: 'In conversation' };
  return STAGE_BADGES[stage] || STAGE_BADGES.new;
}

const STAGE_CTA = {
  new: { label: 'Start planning', to: ROUTES.home },
  matching: { label: 'Continue matching', to: ROUTES.scoutChat },
  recommended: { label: 'Review recommendations', to: ROUTES.destinations },
  matched: { label: 'Review recommendations', to: ROUTES.destinations },
  planning: { label: 'Continue planning', to: ROUTES.scoutChat },
  plan_ready: { label: 'Resume plan builder', to: ROUTES.tripPreview },
  planned: { label: 'View trip', to: ROUTES.dashboard },
  booked: { label: 'View trip', to: ROUTES.dashboard },
  done: { label: 'View trip', to: ROUTES.dashboard },
};

// Stages where a recommendation list already exists and is ready to review —
// shared so dashboardTracks.js's route track doesn't hardcode this set again.
export const RECOMMENDATIONS_READY_STAGES = new Set(['recommended', 'matched']);

export function stageCta(trip) {
  const stage = trip?.lifecycle?.stage ?? 'new';
  if (isItineraryReady(trip)) return { label: 'View trip', to: ROUTES.dashboard };
  if (stage === 'new' && hasContext(trip)) return { label: 'Resume chat', to: ROUTES.scoutChat };
  // planning/matching route by whether the stage's defining artifact
  // actually exists yet (day_plan / a recommendation round), not by stage
  // string alone. `has_day_plan` is the thin TripListItem flag (My Trips);
  // a full TripView (TWM-234 embedded Dashboard) carries the same fact as
  // `plan.day_plan.length > 0` instead -- check both shapes.
  if ((stage === 'planning' || stage === 'plan_ready') && (trip?.has_day_plan || trip?.plan?.day_plan?.length > 0)) {
    return { label: 'Resume plan builder', to: ROUTES.tripPreview };
  }
  if (stage === 'matching' && (trip?.has_recommendation || trip?.matcher?.has_recommendation)) {
    return { label: 'Continue refining', to: ROUTES.destinations };
  }
  return STAGE_CTA[stage] || STAGE_CTA.new;
}

// TWM-184: an honest, one-line current-status string for a My Trips card.
// Reads only the cheap list-summary flags — never triggers a full fetch.
export function tripStatusLine(trip) {
  if (isItineraryReady(trip)) return 'Your full trip plan is ready to book and go.';
  if (trip?.lifecycle?.stage === 'done') return 'This trip has wrapped up.';

  const destination = contextDestination(trip);
  if (!destination) {
    return hasContext(trip) ? "Still figuring out where you're headed." : 'Just getting started.';
  }
  if (trip?.has_day_plan) return 'A full day-by-day plan is set — sorting out bookings next.';
  if (trip?.has_places) return 'Places picked — building the day-by-day plan.';
  if (trip?.awaiting) return "Scout's working out the details with you.";
  return 'Destination settled — planning not started yet.';
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function relativeUpdatedAt(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'just now';
  if (diff < HOUR_MS) return 'updated just now';
  if (diff < DAY_MS) return `updated ${Math.floor(diff / HOUR_MS)}h ago`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 30) return `updated ${days}d ago`;
  return `updated ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
}
