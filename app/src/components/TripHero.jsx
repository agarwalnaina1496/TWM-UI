import { decodeHtmlEntities } from '../lib/text.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

// TWM-220: renders entirely from the composed `TripView.summary` — no raw
// `finalItinerary.trip_summary` read. `summary.travelers` and
// `summary.dates` are composed (with a `source`), so the hero reflects the
// itinerary plan and the honest precision of each fact.
export default function TripHero({ summary, actions = null }) {
  const { travelers, dates, budget } = summary;
  const travelerValue = travelers.value ?? 'Not set';
  const dateValue = dates.label || (dates.precision === 'month' ? dates.month : dates.departure) || `${summary.duration_days} days`;
  const dateLabel = dates.precision === 'exact' ? 'Travel dates'
    : dates.precision === 'month' ? 'Travel month' : 'Trip dates';

  return (
    <section className="dashboard-hero">
      {actions && <div className="hero-top"><div className="hero-actions">{actions}</div></div>}
      <h1 className="hero-title">{decodeHtmlEntities(summary.title)}</h1>
      <p className="hero-desc">{summary.overview}</p>
      <div className="hero-stats">
        <div><strong>{summary.duration_days}</strong><span>Days</span></div>
        <div><strong>{travelerValue}</strong><span>Travelers</span></div>
        <div><strong>{dateValue}</strong><span>{dateLabel}</span></div>
        <div>
          <strong>{money(budget.low)}–{money(budget.high)}</strong>
          <span>{travelers.value ? `Total for ${travelers.value}` : 'Trip total'}</span>
        </div>
      </div>
      <div className="hero-why">
        <span className="hero-why-label">Why this route</span>
        <p>{summary.route_rationale}</p>
      </div>
    </section>
  );
}
