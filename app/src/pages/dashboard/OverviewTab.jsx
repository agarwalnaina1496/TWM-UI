import BudgetBar, { moneyRange } from '../../components/BudgetBar.jsx';
import { VerifyChip } from '../../components/StatusPills.jsx';

// Overview is composed 100% from TripView — summary / budget_breakdown /
// before_you_go. No itinerary-document dependency.
export default function OverviewTab({ view }) {
  const summary = view.summary;
  const budget = view.budget_breakdown;
  return (
    <section aria-label="Trip overview">
      {summary.route_rationale && (
        <div className="route-rationale"><span className="hero-why-label">Why this route</span><p>{summary.route_rationale}</p></div>
      )}

      {budget && (
        <>
          <div className="tab-intro"><div><h2>💰 Estimated budget</h2><p>{budget.fit_note}</p></div></div>
          <BudgetBar low={summary.budget.low} high={summary.budget.high} min={0} max={Math.max(summary.budget.high, 1)} />
          <div className="budget-summary-card">
            {budget.lines.map((line, index) => <div className="budget-summary-row" key={index}><span>{line.category}</span><strong>{moneyRange(line.low, line.high)}</strong><p>{line.note}</p></div>)}
            <div className="budget-summary-row total"><span>Estimated total</span><strong>{moneyRange(summary.budget.low, summary.budget.high)}</strong></div>
          </div>
        </>
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
