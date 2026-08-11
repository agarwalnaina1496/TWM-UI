const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function TripHero({ finalItinerary, travelers, actions = null }) {
  const { trip_summary: summary, budget_summary: budget } = finalItinerary;
  const tripDatesLabel = summary.date_range || `Duration-only · Day 1–${summary.duration_days}`;
  const partySize = travelers || summary.travelers || 2;

  return (
    <section className="dashboard-hero">
      {actions && <div className="hero-top"><div className="hero-actions">{actions}</div></div>}
      <h1 className="hero-title">{summary.title}</h1>
      <p className="hero-desc">{summary.overview}</p>
      <div className="hero-stats">
        <div><strong>{summary.duration_days}</strong><span>Days</span></div>
        <div><strong>{partySize}</strong><span>Travelers</span></div>
        <div><strong>{tripDatesLabel}</strong><span>Trip dates</span></div>
        <div><strong>{money(budget.total_low)}–{money(budget.total_high)}</strong><span>Total for {partySize}</span></div>
      </div>
      <div className="hero-why">
        <span className="hero-why-label">Why this route</span>
        <p>{summary.route_rationale}</p>
      </div>
    </section>
  );
}
