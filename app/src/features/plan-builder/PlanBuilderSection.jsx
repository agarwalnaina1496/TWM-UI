import HonestTransition from '../../components/ui/HonestTransition.jsx';
import ErrorBanner from '../../components/ui/ErrorBanner.jsx';
import DayTimeline from './DayTimeline.jsx';
import FreeTextComposer from './FreeTextComposer.jsx';
import { REOPEN_STEPS } from './constants.js';
import { usePlanBuilder } from './usePlanBuilder.js';
import './plan-builder.css';
import '../../styles/feedback.css';

// The Plan Builder section: generate, edit, approve and reopen a trip's
// day-by-day plan. Fully self-contained -- it reads the current trip itself,
// owns its state and commands (usePlanBuilder), and carries its own
// styling -- so it can be rendered anywhere as <PlanBuilderSection />.
// Optional props, only for a place with more to do around it:
//   navigateTo(path, opts)  navigate when planning moves off this screen
//   guideMessage            Guide's message to show on first render
//   chrome({ reversing, ready, summary })  page chrome (back link, header)
//                           placed above the plan; the section stays unaware
//                           of what a page wants to put there.
export default function PlanBuilderSection({ navigateTo, guideMessage, chrome }) {
  const builder = usePlanBuilder({ navigateTo, guideMessage });
  const { reversing, bootStatus, plan, summary } = builder;
  const ready = !reversing && bootStatus === 'ready' && Boolean(plan);
  return (
    <>
      {chrome?.({ reversing, ready, summary })}
      <PlanBuilderBody {...builder} />
    </>
  );
}

function PlanBuilderBody(props) {
  const { reversing, bootStatus, bootError, plan } = props;

  if (reversing) return <HonestTransition steps={REOPEN_STEPS} label="Finding new matches" />;
  if (bootStatus === 'error') return <ErrorBanner message={<><strong>Planning could not start</strong><span>{bootError}</span></>} />;
  if (bootStatus !== 'ready' || !plan) {
    return <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Scout is drafting your plan…</div>;
  }
  return <PlanBuilderReady {...props} />;
}

function PlanBuilderReady({
  summary, message, reversalError, reopenChoicePending, resolveReopenChoice,
  pending, reversing, dayPlan, removePlace, drawerOpen, setDrawerOpen,
  sendChat, generate, reopenDestinationDiscovery,
}) {
  return (
    <div>
      <section className="plan-summary" aria-label="Plan summary">
        <div><strong>{summary.destinationCount}</strong><span>destinations</span></div>
        <div><strong>{summary.placeCount}</strong><span>planned places</span></div>
        <div><strong>{summary.durationDays}</strong><span>days</span></div>
      </section>

      {message && <div className="revision-message" role="status">{message}</div>}
      {reversalError && <ErrorBanner message={reversalError} />}
      {reopenChoicePending && (
        <div className="reversal-choice" role="group" aria-label="Choose how to reopen destination discovery">
          <button type="button" className="btn btn-ghost" disabled={pending || reversing} onClick={() => resolveReopenChoice('reopen_destination_revisit')}>
            Revisit my existing options
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending || reversing} onClick={() => resolveReopenChoice('reopen_destination_fresh')}>
            Start a fresh search
          </button>
        </div>
      )}

      <DayTimeline dayPlan={dayPlan} pending={pending} onRemovePlace={removePlace} />

      <div className="chat-drawer-toggle">
        <button type="button" className="btn btn-ghost" onClick={() => setDrawerOpen(open => !open)} aria-expanded={drawerOpen}>
          {drawerOpen ? 'Close chat ▾' : 'Anything else to change? ▴'}
        </button>
      </div>
      {drawerOpen && (
        <section className="chat-drawer" aria-label="Chat with Scout">
          <FreeTextComposer pending={pending} placeholder="Tell Scout what to change…" onSubmit={sendChat} />
        </section>
      )}

      {/* TWM-174: Approve is the single, visually distinct commit action —
          deliberately its own row, not sharing space with the free-text
          refine drawer above (different-weight actions). */}
      <footer className="builder-footer">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={generate}>Approve this plan →</button>
      </footer>

      {!reopenChoicePending && (
        <p className="reversal-link">
          <button type="button" className="link-button" onClick={reopenDestinationDiscovery} disabled={pending}>
            Not the right destination? Let's explore other options →
          </button>
        </p>
      )}
    </div>
  );
}
