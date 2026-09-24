import BudgetBar, { moneyRange } from '../../components/BudgetBar.jsx';
import { VerifyChip } from '../../components/StatusPills.jsx';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../../context/TripContext.jsx';
import { contextFactRows, dashboardPrimaryCta, destinationFactRow } from '../../lib/dashboardTracks.js';
import { withTripId } from '../../lib/tripUrl.js';

// Overview is composed 100% from TripView — summary / budget_breakdown /
// before_you_go. No itinerary-document dependency.
export default function OverviewTab({ view, tripId }) {
  const navigate = useNavigate();
  const { setCurrentTripId } = useTrip();
  const summary = view.summary;
  const budget = view.budget_breakdown;
  function go(cta) {
    setCurrentTripId(tripId);
    navigate(withTripId(cta.to, tripId));
  }
  return (
    <section aria-label="Trip overview">
      {summary?.route_rationale && (
        <div className="route-rationale"><span className="hero-why-label">Why this route</span><p>{summary.route_rationale}</p></div>
      )}

      {budget ? (
        <>
          <div className="tab-intro"><div><h2>💰 Estimated budget</h2><p>{budget.fit_note}</p></div></div>
          <BudgetBar low={summary.budget.low} high={summary.budget.high} min={0} max={Math.max(summary.budget.high, 1)} />
          <div className="budget-summary-card">
            {budget.lines.map((line, index) => <div className="budget-summary-row" key={index}><span>{line.category}</span><strong>{moneyRange(line.low, line.high)}</strong><p>{line.note}</p></div>)}
            <div className="budget-summary-row total"><span>Estimated total</span><strong>{moneyRange(summary.budget.low, summary.budget.high)}</strong></div>
          </div>
        </>
      ) : (
        <div className="trip-facts content-narrow">
          <h2 className="trip-facts-heading">Your trip so far</h2>
          {[...contextFactRows(view), destinationFactRow(view)].map(row => (
            <div className="trip-facts-row" key={row.label}>
              <span className="trip-facts-label">{row.label}</span>
              {row.cta ? <button type="button" className="btn btn-ghost" onClick={() => go(row.cta)}>{row.cta.label} →</button> : <span className="trip-facts-value">{row.value}</span>}
            </div>
          ))}
          {dashboardPrimaryCta(view) && <div className="overview-primary-cta"><button type="button" className="btn btn-primary" onClick={() => go(dashboardPrimaryCta(view))}>{dashboardPrimaryCta(view).label} →</button></div>}
        </div>
      )}

      {view.before_you_go?.length > 0 && (
        <div className="before-you-go">
          <div className="tab-intro"><div><h2>🎒 Before you go</h2></div></div>
          <ul className="trip-notes-list">
            {view.before_you_go.map((item, index) => (
              <li key={index}>
                <strong>{item.title}</strong> — {item.detail} {item.verify && <VerifyChip />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
