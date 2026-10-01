import { decodeHtmlEntities } from '../lib/text.js';
import { contextDestination } from '../lib/tripLifecycle.js';
import { formatMoney } from '../lib/formatters.js';
import { DISCOVER_STAGES } from '../constants/tripStages.js';
import '../styles/dashboard.css';


// TWM-220: renders entirely from the composed `TripView.summary` — no raw
// `finalItinerary.trip_summary` read. `summary.travelers` and
// `summary.dates` are composed (with a `source`), so the hero reflects the
// itinerary plan and the honest precision of each fact.
// TWM-234: returns null (not a "Not set yet" placeholder) when the fact
// isn't known yet -- a fresh, pre-match trip has nothing to show here, and
// a row of placeholder tiles around an empty conversation reads as "trip
// dashboard" chrome for something that isn't a trip yet. The stat row
// below only renders the facts that are actually known, growing as the
// traveler's answers come in, the same way context_recap pills do
// elsewhere -- never a fixed-size row with blanks.
function heroFactValue(view, key) {
  const item = (view.context_recap || []).find(fact => fact.key === key);
  return item?.value || null;
}

// TWM-234: the "still working this out" fallback previously always
// attributed the pending work to Guide, even on a Meridian-owned stage
// (matching/recommended/matched, before a destination is even settled) —
// misleading, since Guide hasn't started yet at that point. Scout is the
// only agent name ever shown to the traveler, so the copy stays
// stage-accurate about what's happening without naming either specialist.
function stillWorkingCopy(view) {
  return DISCOVER_STAGES.has(view?.lifecycle?.stage)
    ? 'Scout is still narrowing down the best match.'
    : 'Scout is still working out your plan.';
}

// TWM-234: Discover and Plan are two distinct modules, not one fixed
// pipeline -- this small label is the one constant, always-visible signal
// of which one a trip is currently in, regardless of which tab is active
// or what else on the hero has or hasn't filled in yet.
function moduleLabel(view) {
  return DISCOVER_STAGES.has(view?.lifecycle?.stage)
    ? { text: 'Discovering a destination', cls: 'module-discover' }
    : { text: 'Planning your trip', cls: 'module-plan' };
}

// The pre-plan and frozen views intentionally share one DOM shape.
// oxlint-disable-next-line complexity
export default function TripHero({ view, actions = null }) {
  const summary = view.summary;
  const prePlan = !summary;
  const travelers = summary?.travelers;
  const dates = summary?.dates;
  const budget = summary?.budget;
  const destination = contextDestination(view);
  const module = moduleLabel(view);

  // Post-plan, every field below comes from the composed summary and is
  // always present -- the stat row is a fixed four-tile grid, same as
  // before. Pre-plan, each tile only exists once its fact is actually
  // known (heroFactValue returns null otherwise), so the row grows from
  // nothing as the conversation fills it in, instead of showing four
  // "Not set yet" placeholders around an empty chat.
  const heroStats = prePlan
    ? [
      { key: 'trip_duration', label: 'Days', value: heroFactValue(view, 'trip_duration') },
      { key: 'num_travelers', label: 'Travelers', value: heroFactValue(view, 'num_travelers') },
      { key: 'travel_dates', label: 'Travel dates', value: heroFactValue(view, 'travel_dates') },
      { key: 'budget', label: 'Budget', value: heroFactValue(view, 'budget') },
    ].filter(stat => stat.value)
    : [
      { key: 'duration', label: 'Days', value: summary.duration_days },
      { key: 'travelers', label: 'Travelers', value: travelers.value ?? 'Not set' },
      {
        key: 'dates',
        label: dates.precision === 'exact' ? 'Travel dates' : dates.precision === 'month' ? 'Travel month' : 'Trip dates',
        value: dates.label || (dates.precision === 'month' ? dates.month : dates.departure) || `${summary.duration_days} days`,
      },
      {
        key: 'budget',
        label: travelers.value ? `Total for ${travelers.value}` : 'Trip total',
        value: `${formatMoney(budget.low)}–${formatMoney(budget.high)}`,
      },
    ];

  return (
    <section className="dashboard-hero">
      <p className={`hero-module-label ${module.cls}`}>{module.text}</p>
      <div className="hero-top">
        <h1 className="hero-title">{decodeHtmlEntities(summary?.title || destination || view.title || 'Your trip')}</h1>
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
      <p className="hero-desc">{summary?.overview || stillWorkingCopy(view)}</p>
      {heroStats.length > 0 && (
        <div className="hero-stats">
          {heroStats.map(stat => (
            <div key={stat.key}><strong>{stat.value}</strong><span>{stat.label}</span></div>
          ))}
        </div>
      )}
      {summary && (
        <div className="hero-why">
          <span className="hero-why-label">Why this route</span>
          <p>{summary.route_rationale}</p>
        </div>
      )}
    </section>
  );
}
