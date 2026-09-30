import HonestTransition from '../ui/HonestTransition.jsx';
import OptionsCompare from './OptionsCompare.jsx';
import { MATCHING_STEPS } from '../../constants/destinationsMatching.js';
import { destinationsPhase } from '../../lib/destinationsPhase.js';

// TWM-234: the render half of Destinations -- extracted so the same
// comparison UI can render standalone (Destinations.jsx) or embedded
// directly in Dashboard Overview, no intermediate CTA, same pattern as
// ChatConversation. All state and commands come from useDestinationsMatching();
// this component only renders it, dispatching on a single computed phase
// instead of a long chain of `&&`-guarded conditions.
export default function DestinationsPanel(props) {
  const {
    tripLoadError, retryTripLoad,
    recoError, refreshLatest,
    triggerError, triggerContinue,
    lastMeridianMessage, clarifyInput, setClarifyInput, submitClarification,
    outcome, tapFailureChip,
  } = props;

  const phase = destinationsPhase(props);

  if (phase === 'trip-error') {
    return (
      <div className="price-evidence state-unsafe" role="alert">
        <strong>Trip could not be loaded</strong>
        <span>{tripLoadError?.message || 'Something went wrong.'}</span>
        <button type="button" className="btn btn-ghost" onClick={retryTripLoad}>Try again</button>
      </div>
    );
  }

  if (phase === 'reco-error') {
    return (
      <div className="price-evidence state-unsafe" role="alert">
        <strong>Recommendations unavailable</strong>
        <span>{recoError}</span>
        <button type="button" className="btn btn-ghost" onClick={refreshLatest}>Try again</button>
      </div>
    );
  }

  if (phase === 'thinking') {
    return <HonestTransition steps={MATCHING_STEPS} label="Finding your matches" />;
  }

  if (phase === 'trigger-error') {
    return (
      <div className="price-evidence state-unsafe" role="alert">
        <strong>Recommendations unavailable</strong>
        <span>{triggerError}</span>
        <button type="button" className="btn btn-ghost" onClick={triggerContinue}>Try again</button>
      </div>
    );
  }

  if (phase === 'awaiting') {
    return (
      <div className="chat-log" aria-live="polite">
        <div className="chat-row chat-row-assistant"><div className="chat-bub chat-bub-assistant" style={{ whiteSpace: 'pre-wrap' }}>{lastMeridianMessage}</div></div>
        <div className="chat-input-bar">
          <input type="text" className="chat-input" placeholder="Your answer…" value={clarifyInput} onChange={event => setClarifyInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitClarification(); }} />
          <button type="button" className="chat-send" onClick={submitClarification} aria-label="Send">→</button>
        </div>
      </div>
    );
  }

  if (phase === 'failure') {
    return (
      <div className="terminal-failure" role="alert">
        <span className="terminal-failure-badge">Scout</span>
        <strong>{outcome.data.message}</strong>
        {outcome.data.constraintAdjustmentSuggestions.length > 0 && (
          <div className="terminal-failure-chips">
            {outcome.data.constraintAdjustmentSuggestions.map(suggestion => (
              <button type="button" key={suggestion} className="chip" onClick={() => tapFailureChip(suggestion, outcome.data.status)}>{suggestion}</button>
            ))}
          </div>
        )}
        <div className="chat-input-bar">
          <input type="text" className="chat-input" placeholder="Adjust and try again…" value={clarifyInput} onChange={event => setClarifyInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitClarification(); }} />
          <button type="button" className="chat-send" onClick={submitClarification} aria-label="Send">→</button>
        </div>
      </div>
    );
  }

  if (phase === 'options-invalid') {
    return (
      <div className="price-evidence state-unsafe" role="alert">
        <strong>Recommendations unavailable</strong>
        <span>We could not validate the recommendation response safely. Please try again.</span>
      </div>
    );
  }

  if (phase === 'options') {
    return <OptionsCompare {...props} />;
  }

  return null;
}
