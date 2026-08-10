import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { createEntryCommand, safeExecuteMockEntryCommand } from '../lib/mockTripCommands.js';
import '../styles/chat.css';

export default function JourneyEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, commandSnapshot, applyMockCommandResponse } = useTrip();
  const intent = params.get('intent');
  const [destination, setDestination] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(intent === ENTRY_INTENTS.DISCOVER);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || intent !== ENTRY_INTENTS.DISCOVER) return;
    initialized.current = true;
    const outcome = safeExecuteMockEntryCommand(createEntryCommand({ intent, expectedVersion: commandSnapshot?.version ?? 1 }), trip);
    if (outcome.data) {
      applyMockCommandResponse(outcome.data);
      setResult(outcome.data);
    } else setError(outcome.error);
    setBusy(false);
  }, [applyMockCommandResponse, commandSnapshot?.version, intent, trip]);

  function submitDestination() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = safeExecuteMockEntryCommand(createEntryCommand({
      intent: ENTRY_INTENTS.KNOWN_DESTINATION,
      destination,
      expectedVersion: commandSnapshot?.version ?? 1,
    }), trip);
    if (outcome.data?.status === 'SUCCESS') {
      applyMockCommandResponse(outcome.data);
      setResult(outcome.data);
    } else if (outcome.data) setError(outcome.data.message);
    else setError(outcome.error);
    setBusy(false);
  }

  const isDiscover = intent === ENTRY_INTENTS.DISCOVER;
  return (
    <div className="wrap chat-page">
      <span className="eyebrow">Trip setup</span>
      <h1>{isDiscover ? <>Discover <em>your destination</em></> : <>Start with <em>your destination</em></>}</h1>
      {isDiscover ? (
        <>
          {busy && <div className="think" role="status">Preparing destination discovery…</div>}
          {result && <div className="chat-bub chat-bub-assistant">{result.message}</div>}
          {result && <button type="button" className="btn btn-primary" onClick={() => navigate('/destinations?next=preview')}>See destinations →</button>}
        </>
      ) : (
        <>
          <p className="lede">Tell us where you are going. We’ll take you straight to planning—no Scout or destination matching needed.</p>
          <div className="chat-input-bar">
            <input className="chat-input" aria-label="Destination" placeholder="e.g. Coorg, Karnataka" value={destination} onChange={event => setDestination(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitDestination(); }} />
            <button type="button" className="chat-send" onClick={submitDestination} aria-label="Start planning">→</button>
          </div>
          {result && <div className="chat-bub chat-bub-assistant">{result.message}</div>}
          {result && <button type="button" className="btn btn-primary" onClick={() => navigate('/trip-preview')}>Continue to planning →</button>}
        </>
      )}
      {error && <div className="price-evidence state-unsafe" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={isDiscover ? () => window.location.reload() : submitDestination}>Try again</button></div>}
      <small>Fixture-backed preview — no Backend or agent call was made.</small>
    </div>
  );
}
