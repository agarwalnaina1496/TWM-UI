// TWM-172: Home's hero-selection + discover-only classification.
//
// There is no structured start/end date anywhere in the data DashboardHome
// has access to — the trip-list summary (`TravelWithMe/twm/schemas/trips.py`
// TripSummary) only exposes `itinerary_state.status` (a bare string) and a
// handful of free-text `trip_context` fields (`month`, `travel_window`,
// `dates`) that Scout extracts verbatim and are explicitly not a guaranteed
// schema (see TWM_Docs/TRIP_STATE.md). Per product decision, this is a
// deliberate best-effort heuristic against `trip_context.month` (the most
// structured of the three) — not a fabricated exact date. A trip whose month
// can't be parsed simply doesn't compete for the hero position; it still
// appears in the regular list.

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// Best-effort: finds the first recognizable month name inside trip_context's
// free-text fields, in order of how likely each is to actually name a month.
// Returns the first day of the nearest future (or current) occurrence of
// that month — if the named month has already passed this year, it's
// assumed to mean next year, since travelers don't plan trips into the past.
export function parseTripMonthDate(tripContext, now = new Date()) {
  const candidates = [tripContext?.month, tripContext?.travel_window, tripContext?.dates];
  const text = candidates.find(value => typeof value === 'string' && value.trim());
  if (!text) return null;
  const lower = text.toLowerCase();
  const monthIndex = MONTH_NAMES.findIndex(name => lower.includes(name));
  if (monthIndex === -1) return null;

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const year = monthIndex < currentMonth ? currentYear + 1 : currentYear;
  return new Date(year, monthIndex, 1);
}

function isSameMonth(date, now) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

const DISCOVER_ONLY_STAGES = new Set(['matching', 'recommendation_ready', 'recommended']);

// A trip "counts" for hero ranking (and the regular committed list) only
// once a destination has actually been chosen — stage 'matched' and beyond
// (the stage name itself means a destination was picked, same semantics
// stageBadge/stageCta already use for "Destination chosen"). Earlier stages
// (a fresh chat with some context, still matching, or still browsing
// recommendations) are browsing-only and belong in the explore rail.
// Deliberately stage-based, not trip_context.selected_option presence — that
// field isn't reliably populated across every path that reaches these
// stages, where stage-based classification is.
export function isDiscoverOnly(tripState) {
  const stage = tripState?.stage ?? 'new';
  const hasContext = !!(tripState?.trip_context && Object.keys(tripState.trip_context).length > 0);
  if (stage === 'new') return hasContext;
  return DISCOVER_ONLY_STAGES.has(stage);
}

// Ranks committed, non-completed trips: a trip whose parsed month is the
// current month wins outright (treated as "ongoing"); otherwise the nearest
// future month wins; a trip with no parseable month never wins the hero
// position. Returns null when nothing qualifies — the hero section must be
// absent entirely in that case, never a placeholder.
export function selectHeroTrip(trips, now = new Date()) {
  let ongoing = null;
  let nearestUpcoming = null;
  let nearestUpcomingDate = null;

  for (const t of trips) {
    const parsed = parseTripMonthDate(t.trip_state?.trip_context, now);
    if (!parsed) continue;
    if (isSameMonth(parsed, now)) {
      if (!ongoing) ongoing = t;
      continue;
    }
    if (parsed > now && (!nearestUpcomingDate || parsed < nearestUpcomingDate)) {
      nearestUpcoming = t;
      nearestUpcomingDate = parsed;
    }
  }

  return ongoing || nearestUpcoming || null;
}
