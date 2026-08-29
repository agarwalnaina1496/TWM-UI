import { tripDatesLabel } from '../lib/atlasView.js';
import { decodeHtmlEntities } from '../lib/text.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

// TWM-175: partySize used to read summary.travelers, a field that doesn't
// exist on AtlasTripSummary (the real field is num_travelers) — it always
// silently fell back to a hardcoded 2 regardless of the real count.
//
// TWM-213/TWM-215: travelerTotal and travelerIsApprox are deliberately
// separate from one formatted string. travelerTotal keeps the stat a plain
// number (exact composition, or Atlas's own resolved approximation) so the
// "Total for N" math and the stat itself both read the same value;
// travelerIsApprox only decides whether the unit label says "Travelers" or
// flags it as approximate. Collapsing composition/num_travelers into one
// numeric prop (dropping the resolved approximation whenever composition
// wasn't set) is what made this stat show "Not set" live even when Atlas
// had genuinely resolved a rough count (e.g. from "couple").
export default function TripHero({ finalItinerary, boardDays = [], travelerTotal = null, travelerIsApprox = false, actions = null }) {
  const { trip_summary: summary, budget_summary: budget, days } = finalItinerary;
  const dates = tripDatesLabel(days, summary.date_range, boardDays);
  const travelerUnitLabel = travelerTotal ? (travelerIsApprox ? 'Travelers (approx)' : 'Travelers') : 'Travelers';

  return (
    <section className="dashboard-hero">
      {actions && <div className="hero-top"><div className="hero-actions">{actions}</div></div>}
      <h1 className="hero-title">{decodeHtmlEntities(summary.title)}</h1>
      <p className="hero-desc">{summary.overview}</p>
      <div className="hero-stats">
        <div><strong>{summary.trip_duration}</strong><span>Days</span></div>
        <div><strong>{travelerTotal ? (travelerIsApprox ? `~${travelerTotal}` : travelerTotal) : 'Not set'}</strong><span>{travelerUnitLabel}</span></div>
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
