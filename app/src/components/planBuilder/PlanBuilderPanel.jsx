import HonestTransition from '../ui/HonestTransition.jsx';
import ErrorBanner from '../ui/ErrorBanner.jsx';
import DayTimeline from './DayTimeline.jsx';
import FreeTextComposer from './FreeTextComposer.jsx';
import { REOPEN_STEPS } from '../../constants/planBuilder.js';
import '../../styles/preview.css';

// TWM-234: the render half of Plan Builder -- extracted so the same
// generate/edit/approve/reopen UI can render standalone (TripPreview.jsx)
// or embedded directly in Dashboard Overview. All state and commands come
// from usePlanBuilder(); this component only renders it.
export default function PlanBuilderPanel(props) {
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
