import { tripDatesLabel } from '../lib/atlasView.js';
import { decodeHtmlEntities } from '../lib/text.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

// TWM-175: partySize used to read summary.travelers, a field that doesn't
// exist on AtlasTripSummary (the real field is num_travelers) — it always
// silently fell back to a hardcoded 2 regardless of the real count.
export default function TripHero({ finalItinerary, boardDays = [], travelerTotal = null, actions = null }) {
  const { trip_summary: summary, budget_summary: budget, days } = finalItinerary;
  const dates = tripDatesLabel(days, summary.date_range, boardDays);

  return (
    <section className="dashboard-hero">
      {actions && <div className="hero-top"><div className="hero-actions">{actions}</div></div>}
      <h1 className="hero-title">{decodeHtmlEntities(summary.title)}</h1>
      <p className="hero-desc">{summary.overview}</p>
      <div className="hero-stats">
        <div><strong>{summary.trip_duration}</strong><span>Days</span></div>
        <div><strong>{travelerTotal ?? 'Not set'}</strong><span>Travelers</span></div>
        <div><strong>{dates.value}</strong><span>{dates.label}</span></div>
        <div><strong>{money(budget.total_low)}–{money(budget.total_high)}</strong><span>{travelerTotal ? `Total for ${travelerTotal}` : 'Trip total'}</span></div>
      </div>
      <div className="hero-why">
        <span className="hero-why-label">Why this route</span>
        <p>{summary.route_rationale}</p>
      </div>
    </section>
  );
}
