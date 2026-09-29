import BudgetBar, { moneyRange } from '../../components/BudgetBar.jsx';
import { VerifyChip } from '../../components/StatusPills.jsx';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../../context/TripContext.jsx';
import { contextFactRows, dashboardPrimaryCta, destinationFactRow } from '../../lib/dashboardTracks.js';
import { withTripId } from '../../lib/tripUrl.js';

// TWM-232: Overview used to be a hard if/else between two structurally
// different pages -- a plain fact table pre-itinerary, a budget
// chart/checklist post-itinerary -- swapped wholesale the moment `summary`
// existed. That's not progressive, it's two dashboards stitched together.
// Same slots now at every stage: facts -> destination -> (budget, once
// there's something new to say) -> before you go. "Why this route" and the
// traveler's own stated budget are TripHero's job (its stat-tile grid
// already shows the raw stated figure pre-plan, "Not set yet" when
// missing) -- both dropped from here entirely; showing them again in
// Overview would just repeat TripHero verbatim. Overview's own Budget
// section only earns its place once there's real added information: the
// computed range breakdown by category, which TripHero's single stat tile
// doesn't carry.
export default function OverviewTab({ view, tripId }) {
  const navigate = useNavigate();
  const { setCurrentTripId } = useTrip();
  const summary = view.summary;
  const budget = view.budget_breakdown;
  const primaryCta = dashboardPrimaryCta(view);
  function go(cta) {
    setCurrentTripId(tripId);
    navigate(withTripId(cta.to, tripId));
  }
  return (
    <section aria-label="Trip overview">
      <div className="trip-facts content-narrow">
        <h2 className="trip-facts-heading">Your trip so far</h2>
        {[...contextFactRows(view), destinationFactRow(view)].map(row => (
          <div className="trip-facts-row" key={row.label}>
            <span className="trip-facts-label">{row.label}</span>
            {row.value ? <span className="trip-facts-value">{row.value}</span> : <span className="trip-facts-value muted">Not chosen yet</span>}
          </div>
        ))}
      </div>

      {budget && (
        <div className="overview-budget content-narrow">
          <div className="tab-intro"><div><h2>💰 Budget</h2></div></div>
          <p>{budget.fit_note}</p>
          <BudgetBar low={summary.budget.low} high={summary.budget.high} min={0} max={Math.max(summary.budget.high, 1)} />
          <div className="budget-summary-card">
            {budget.lines.map((line, index) => <div className="budget-summary-row" key={index}><span>{line.category}</span><strong>{moneyRange(line.low, line.high)}</strong><p>{line.note}</p></div>)}
            <div className="budget-summary-row total"><span>Estimated total</span><strong>{moneyRange(summary.budget.low, summary.budget.high)}</strong></div>
          </div>
        </div>
      )}

      {primaryCta && (
        <div className="overview-primary-cta"><button type="button" className="btn btn-primary" onClick={() => go(primaryCta)}>{primaryCta.label} →</button></div>
      )}

      <div className="before-you-go content-narrow">
        <div className="tab-intro"><div><h2>🎒 Before you go</h2></div></div>
        {view.before_you_go?.length > 0 ? (
          <ul className="trip-notes-list">
            {view.before_you_go.map((item, index) => (
              <li key={index}>
                <strong>{item.title}</strong> — {item.detail} {item.verify && <VerifyChip />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="overview-empty-note">Nothing to verify yet — this fills in once your plan is ready.</p>
        )}
      </div>
    </section>
  );
}
