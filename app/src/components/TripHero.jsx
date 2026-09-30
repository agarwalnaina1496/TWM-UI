import { decodeHtmlEntities } from '../lib/text.js';
import { contextDestination } from '../lib/tripLifecycle.js';
import { formatMoney } from '../lib/formatters.js';


// TWM-220: renders entirely from the composed `TripView.summary` — no raw
// `finalItinerary.trip_summary` read. `summary.travelers` and
// `summary.dates` are composed (with a `source`), so the hero reflects the
// itinerary plan and the honest precision of each fact.
function heroFactValue(view, key) {
  const item = (view.context_recap || []).find(fact => fact.key === key);
  return item?.value || 'Not set yet';
}

// TWM-234: the "still working this out" fallback previously always
// attributed the pending work to Guide, even on a Meridian-owned stage
// (matching/recommended/matched, before a destination is even settled) —
// misleading, since Guide hasn't started yet at that point. Scout is the
// only agent name ever shown to the traveler, so the copy stays
// stage-accurate about what's happening without naming either specialist.
const MATCHING_STAGES = new Set(['new', 'matching', 'recommended', 'matched']);

function stillWorkingCopy(view) {
  return MATCHING_STAGES.has(view?.lifecycle?.stage)
    ? 'Scout is still narrowing down the best match.'
    : 'Scout is still working out your plan.';
}

// The pre-plan and frozen views intentionally share one DOM shape.
// oxlint-disable-next-line complexity
export default function TripHero({ view, actions = null }) {
  const summary = view.summary;
  const prePlan = !summary;
  const travelers = summary?.travelers;
  const dates = summary?.dates;
  const budget = summary?.budget;
  const travelerValue = prePlan ? heroFactValue(view, 'num_travelers') : (travelers.value ?? 'Not set');
  const dateValue = prePlan ? heroFactValue(view, 'travel_dates') : (dates.label || (dates.precision === 'month' ? dates.month : dates.departure) || `${summary.duration_days} days`);
  const dateLabel = prePlan ? 'Travel dates' : dates.precision === 'exact' ? 'Travel dates'
    : dates.precision === 'month' ? 'Travel month' : 'Trip dates';
  const durationValue = prePlan ? heroFactValue(view, 'trip_duration') : summary.duration_days;
  const budgetValue = prePlan ? heroFactValue(view, 'budget') : `${formatMoney(budget.low)}–${formatMoney(budget.high)}`;
  const destination = contextDestination(view);

  return (
    <section className="dashboard-hero">
      <div className="hero-top">
        <h1 className="hero-title">{decodeHtmlEntities(summary?.title || destination || view.title || 'Your trip')}</h1>
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
      <p className="hero-desc">{summary?.overview || stillWorkingCopy(view)}</p>
      <div className="hero-stats">
        <div><strong>{durationValue}</strong><span>Days</span></div>
        <div><strong>{travelerValue}</strong><span>Travelers</span></div>
        <div><strong>{dateValue}</strong><span>{dateLabel}</span></div>
        <div>
          <strong>{budgetValue}</strong>
          <span>{prePlan ? 'Budget' : travelers.value ? `Total for ${travelers.value}` : 'Trip total'}</span>
        </div>
      </div>
      {summary && (
        <div className="hero-why">
          <span className="hero-why-label">Why this route</span>
          <p>{summary.route_rationale}</p>
        </div>
      )}
    </section>
  );
}
