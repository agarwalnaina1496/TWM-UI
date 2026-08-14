import { tripDatesLabel } from '../lib/atlasView.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function TripHero({
  finalItinerary, travelers, actions = null,
  unresolvedCount = 0, assumptionsCount = 0, confirmedCount = 0,
  onJumpToUnresolved, onJumpToAssumptions,
}) {
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
      <div className="hero-substats">
        <button type="button" className={`hero-substat${confirmedCount > 0 ? ' ok' : ''}`} onClick={onJumpToUnresolved} disabled={!onJumpToUnresolved}>
          <div><strong>{confirmedCount}</strong><span>Confirmed</span></div>
        </button>
        <button type="button" className={`hero-substat${unresolvedCount > 0 ? ' warn' : ''}`} onClick={onJumpToUnresolved} disabled={!onJumpToUnresolved || unresolvedCount === 0}>
          <div><strong>{unresolvedCount}</strong><span>Open items</span></div>
        </button>
        <button type="button" className="hero-substat" onClick={onJumpToAssumptions} disabled={!onJumpToAssumptions || assumptionsCount === 0}>
          <div><strong>{assumptionsCount}</strong><span>Assumptions made</span></div>
        </button>
      </div>
      <div className="budget-chip-row">
        {budget.lines.map((line, index) => <span className="budget-chip" key={index}>{line.category} <strong>{money(line.amount_low)}–{money(line.amount_high)}</strong></span>)}
      </div>
      <div className="hero-why">
        <span className="hero-why-label">Why this route</span>
        <p>{summary.route_rationale}</p>
      </div>
    </section>
  );
}
