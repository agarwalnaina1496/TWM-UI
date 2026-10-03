import HonestTransition from '../../components/ui/HonestTransition.jsx';
import OptionsCompare from './OptionsCompare.jsx';
import { useDestinations } from './useDestinations.js';
import { MATCHING_STEPS } from './constants.js';
import { destinationsPhase } from './destinationsPhase.js';
import '../../styles/feedback.css';
import './destinations.css';

// The destination-comparison section: matching a traveler's trip against
// ranked destination options and letting them pick one or refine. Fully
// self-contained -- it reads the current trip itself, owns its own state and
// commands (useDestinations), and carries its own styling -- so it can be
// rendered anywhere with just <DestinationsSection />. It renders nothing
// about what happens after a destination is chosen; that is YourPickSection.
export default function DestinationsSection() {
  const state = useDestinations();
  const phase = destinationsPhase(state);

  return (
    <div>
      {state.pills.length > 0 && (
        <div className="trip-recap">{state.pills.map(p => <span key={p} className="recap-pill">{p}</span>)}</div>
      )}
      <PhaseContent phase={phase} state={state} />
    </div>
  );
}

function PhaseContent({ phase, state }) {
  const {
    tripLoadError, retryTripLoad, recoError, refreshLatest,
    triggerError, triggerContinue,
    lastMeridianMessage, clarifyInput, setClarifyInput, submitClarification,
    outcome, tapFailureChip,
  } = state;

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
    return <OptionsCompare {...state} />;
  }

  return null;
}
