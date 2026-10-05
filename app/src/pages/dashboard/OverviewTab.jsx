import BudgetBar, { moneyRange } from '../../components/BudgetBar.jsx';
import { VerifyChip } from '../../components/StatusPills.jsx';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../../context/TripContext.jsx';
import { dashboardPrimaryCta } from '../../lib/dashboardTracks.js';
import { withTripId } from '../../lib/tripUrl.js';
import { phaseProgress } from '../../lib/phaseProgress.js';
import { ROUTES } from '../../constants/routes.js';
import ChatSection from '../../features/chat/ChatSection.jsx';
import DestinationsSection from '../../features/destinations/DestinationsSection.jsx';
import YourPickSection from '../../features/your-pick/YourPickSection.jsx';
import PlanBuilderSection from '../../features/plan-builder/PlanBuilderSection.jsx';

// TWM-232: Overview used to be a hard if/else between two structurally
// different pages -- a plain fact table pre-itinerary, a budget
// chart/checklist post-itinerary -- swapped wholesale the moment `summary`
// existed. That's not progressive, it's two dashboards stitched together.
// "Why this route" and the traveler's own stated budget are TripHero's job
// (its stat-tile grid already shows the raw stated figure pre-plan, "Not
// set yet" when missing) -- both dropped from here entirely; showing them
// again in Overview would just repeat TripHero verbatim. Overview's own
// Budget section only earns its place once there's real added information:
// the computed range breakdown by category, which TripHero's single stat
// tile doesn't carry.
//
// TWM-234: the plain "Your trip so far" facts table is gone -- it read as a
// checklist of trip facets even at stages where nothing about it was
// actionable. The primary CTA no longer just navigates either -- when the
// next step is the conversation (matching/planning), the Destinations
// comparison (recommended/matched), or Plan Builder (plan_ready/planning
// with a day_plan), the real panel renders inline, right here. No click
// needed to see what's next; it IS what's next. Destinations and "Your
// pick" are self-contained sections (features/), so this page only decides
// which one to render -- selecting a destination or approving a plan changes
// the trip's stage, primaryCta recomputes from the refetched TripView, and
// the section swaps in place without ever leaving this page.
export default function OverviewTab({ view, tripId }) {
  const navigate = useNavigate();
  const { setCurrentTripId } = useTrip();
  const summary = view.summary;
  const budget = view.budget_breakdown;
  const primaryCta = dashboardPrimaryCta(view);
  const embedChat = primaryCta?.to === ROUTES.scoutChat;
  const embedDestinations = primaryCta?.to === ROUTES.destinations;
  const embedPlanBuilder = primaryCta?.to === ROUTES.tripPreview;
  const selectedOption = view.lifecycle?.selected_option ?? null;
  const progress = phaseProgress(view);

  function go(cta) {
    setCurrentTripId(tripId);
    navigate(withTripId(cta.to, tripId));
  }

  return (
    <section aria-label="Trip overview">
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

      {progress && (
        <div className="phase-progress content-narrow">
          <div className="phase-progress-label">{progress.label}</div>
          <div className="phase-progress-bar">
            {progress.steps.map((_, index) => <span key={index} className={index <= progress.activeStep ? 'done' : ''} />)}
          </div>
          <div className="phase-progress-steps">
            {progress.steps.map((step, index) => <span key={step} className={index === progress.activeStep ? 'active' : ''}>{step}</span>)}
          </div>
        </div>
      )}

      {primaryCta && embedChat && <ChatSection />}

      {embedDestinations && (selectedOption ? <YourPickSection /> : <DestinationsSection />)}

      {embedPlanBuilder && (
        <div className="content-narrow">
          <PlanBuilderSection />
        </div>
      )}

      {primaryCta && !embedChat && !embedDestinations && !embedPlanBuilder && (
        <div className="overview-primary-cta"><button type="button" className="btn btn-primary" onClick={() => go(primaryCta)}>{primaryCta.label} →</button></div>
      )}

      {summary && (
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
            <p className="overview-empty-note">Nothing to verify yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
