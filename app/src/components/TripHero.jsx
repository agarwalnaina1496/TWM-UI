import { travelerCount, tripDatesLabel } from '../lib/atlasView.js';
import { decodeHtmlEntities } from '../lib/text.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

// TWM-175: partySize used to read summary.travelers, a field that doesn't
// exist on AtlasTripSummary (the real field is num_travelers) — it always
// silently fell back to a hardcoded 2 regardless of the real count.
//
// TWM-213/TWM-215/TWM-216: TripHero is an itinerary-plan summary, not a
// booking surface -- it must only ever reflect what Atlas actually planned
// around (trip_summary.num_travelers, trip_summary.date_range), never the
// structured booking_setup.party / booking_setup.start a traveler later sets
// purely for booking-search precision. Those two kinds of fact have
// different lifecycles (frozen plan vs. freely-refinable booking detail)
// and belong on different surfaces (here vs. Overview's ScheduleStrip);
// showing the booking-precision value here either looked like the itinerary
// itself had changed when it hadn't, or went stale/contradicted the plan
// the moment a traveler picked a start date spanning a different number of
// days than trip_duration. No prop threading needed either way -- both
// facts already live on finalItinerary.trip_summary.
export default function TripHero({ finalItinerary, actions = null }) {
  const { trip_summary: summary, budget_summary: budget, days } = finalItinerary;
  const dates = tripDatesLabel(days, summary.date_range);
  const partySize = travelerCount(summary);

  return (
    <section className="dashboard-hero">
      {actions && <div className="hero-top"><div className="hero-actions">{actions}</div></div>}
      <h1 className="hero-title">{decodeHtmlEntities(summary.title)}</h1>
      <p className="hero-desc">{summary.overview}</p>
      <div className="hero-stats">
        <div><strong>{summary.trip_duration}</strong><span>Days</span></div>
        <div><strong>{partySize ?? 'Not set'}</strong><span>Travelers</span></div>
        <div><strong>{dates.value}</strong><span>{dates.label}</span></div>
        <div><strong>{money(budget.total_low)}–{money(budget.total_high)}</strong><span>{partySize ? `Total for ${partySize}` : 'Trip total'}</span></div>
      </div>
      <div className="hero-why">
        <span className="hero-why-label">Why this route</span>
        <p>{summary.route_rationale}</p>
      </div>
    </section>
  );
}
