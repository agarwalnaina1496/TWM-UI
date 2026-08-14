import { tripDatesLabel } from '../lib/atlasView.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function TripHero({ finalItinerary, travelers, actions = null }) {
  const { trip_summary: summary, budget_summary: budget, days } = finalItinerary;
  const dates = tripDatesLabel(days, summary.date_range);
  const partySize = travelers || summary.travelers || 2;

  return (
    <section className="dashboard-hero">
      {actions && <div className="hero-top"><div className="hero-actions">{actions}</div></div>}
      <h1 className="hero-title">{summary.title}</h1>
      <p className="hero-desc">{summary.overview}</p>
      <div className="hero-stats">
        <div><strong>{summary.trip_duration}</strong><span>Days</span></div>
        <div><strong>{partySize}</strong><span>Travelers</span></div>
        <div><strong>{dates.value}</strong><span>{dates.label}</span></div>
        <div><strong>{money(budget.total_low)}–{money(budget.total_high)}</strong><span>Total for {partySize}</span></div>
      </div>
      <div className="hero-why">
        <span className="hero-why-label">Why this route</span>
        <p>{summary.route_rationale}</p>
      </div>
    </section>
  );
}
