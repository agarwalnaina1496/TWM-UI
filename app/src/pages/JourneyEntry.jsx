import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS, GOLDEN_QUERY, QUICK_REPLIES } from '../data/entryCommandFixtures.js';
import { createEntryCommand, safeExecuteMockEntryCommand } from '../lib/mockTripCommands.js';
import '../styles/chat.css';

let nextMessageId = 1;

export default function JourneyEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, commandSnapshot, applyMockCommandResponse } = useTrip();
  const intent = params.get('intent');
  const isDiscover = intent === ENTRY_INTENTS.DISCOVER;
  const [destination, setDestination] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(isDiscover ? [{ id: nextMessageId++, role: 'assistant', text: "I'm Scout. Tell me what kind of trip you're planning, in your own words." }] : []);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function sendDiscover(message = input) {
    const value = message.trim();
    if (!value || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    setMessages(previous => [...previous, { id: nextMessageId++, role: 'user', text: value }]);
    const outcome = safeExecuteMockEntryCommand(createEntryCommand({
      intent: ENTRY_INTENTS.ADVICE,
      message: value,
      expectedVersion: commandSnapshot?.version ?? 1,
    }), trip);
    if (outcome.data) {
      applyMockCommandResponse(outcome.data);
      setResult(outcome.data);
      setMessages(previous => [...previous, { id: nextMessageId++, role: 'assistant', text: outcome.data.message }]);
    } else setError(outcome.error);
    setBusy(false);
  }

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

  const activeAgent = result?.trip?.trip_state?.active_agent || 'scout';
  const awaiting = result?.trip?.trip_state?.matcher_state?.conversation_context?.awaiting;
  const quickReplies = result ? (QUICK_REPLIES[awaiting] || []) : [GOLDEN_QUERY];

  return (
    <div className="wrap chat-page">
      <span className="eyebrow">{isDiscover ? `✦ ${activeAgent === 'meridian' ? 'Meridian' : 'Scout'}` : 'Trip setup'}</span>
      <h1>{isDiscover ? <>Tell Scout <em>in your own words</em></> : <>Start with <em>your destination</em></>}</h1>
      {isDiscover ? (
        <>
          <p className="lede">Chat naturally, or use the fixture quick replies to run the exact demo conversation.</p>
          <div className="chat-log" aria-live="polite">
            {messages.map(message => (
              <div key={message.id} className={`chat-row chat-row-${message.role}`}>
                <div className={`chat-bub chat-bub-${message.role}`} style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
              </div>
            ))}
            {busy && <div className="think" role="status">{activeAgent === 'meridian' ? 'Meridian' : 'Scout'} is thinking…</div>}
            {!busy && quickReplies.length > 0 && (
              <div className="chat-chip-row" aria-label="Suggested traveler replies">
                {quickReplies.map(reply => <button type="button" className="chip chat-chip-long" key={reply} onClick={() => sendDiscover(reply)}>{reply}</button>)}
              </div>
            )}
            {activeAgent === 'meridian' && <button type="button" className="btn btn-primary" onClick={() => navigate('/destinations?next=preview')}>See destinations →</button>}
          </div>
          <div className="chat-input-bar">
            <input className="chat-input" aria-label="Message Scout" placeholder="Tell Scout about your trip…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') sendDiscover(); }} />
            <button type="button" className="chat-send" onClick={() => sendDiscover()} disabled={busy} aria-label="Send">→</button>
          </div>
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
      {error && <div className="price-evidence state-unsafe" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={isDiscover ? () => sendDiscover() : submitDestination}>Try again</button></div>}
      <small>Fixture-backed {isDiscover ? 'conversation' : 'preview'} — no Backend or agent call was made.</small>
    </div>
  );
}
