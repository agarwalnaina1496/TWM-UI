import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS, QUICK_REPLIES } from '../data/entryCommandFixtures.js';
import { newIdempotencyKey } from '../lib/tripApi.js';
import '../styles/chat.css';

let nextMessageId = 1;

const DISCOVER_WELCOME = "I'm Scout. Tell me what matters to you — vibe, budget, timing, anything — and I'll narrow down destinations that fit.";

export default function JourneyEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { commandSnapshot, sendTripCommand } = useTrip();
  const intent = params.get('intent');
  const isDiscover = intent === ENTRY_INTENTS.DISCOVER;
  const [destination, setDestination] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  // discover_entry establishes Meridian ownership on the traveler's first
  // message; every message after that is a plain traveler_message to the
  // specialist already owning the trip. No Backend command — and so no trip
  // creation — happens before that first send.
  const entered = useRef(false);
  const lastCommand = useRef(null);

  // Hardcoded per-intent greeting shown immediately, with no Backend call —
  // Meridian only gets involved once the traveler actually sends something.
  useEffect(() => {
    if (!isDiscover || initialized.current) return;
    initialized.current = true;
    setMessages(previous => [...previous, { id: nextMessageId++, role: 'assistant', text: DISCOVER_WELCOME }]);
  }, [isDiscover]);

  async function sendDiscover(reply = input) {
    const value = (typeof reply === 'string' ? reply : reply.value).trim();
    if (!value || busy) return;
    const idempotencyKey = lastCommand.current?.message === value ? lastCommand.current.idempotencyKey : newIdempotencyKey();
    lastCommand.current = { message: value, idempotencyKey };
    setInput('');
    setBusy(true);
    setError(null);
    setMessages(previous => [...previous, { id: nextMessageId++, role: 'user', text: value }]);
    try {
      const command = entered.current ? 'traveler_message' : 'discover_entry';
      const response = await sendTripCommand(command, { message: value, idempotencyKey });
      entered.current = true;
      setResult(response);
      if (response.message) setMessages(previous => [...previous, { id: nextMessageId++, role: 'assistant', text: response.message }]);
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function submitDestination() {
    const value = destination.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await sendTripCommand('known_destination_entry', { destination: value });
      setResult(response);
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const awaiting = commandSnapshot?.trip_state?.matcher_state?.conversation_context?.awaiting;
  const quickReplies = (QUICK_REPLIES[awaiting] || []).map(value => ({ label: value, value }));

  return (
    <div className="chat-page chat-screen">
      <div className="chat-context-bar" role="status">
        <span aria-hidden="true">ⓘ</span>
        {isDiscover ? 'Scout is here to help find your destination.' : 'Scout is here to help plan your destination.'}
      </div>
      <span className="eyebrow">{isDiscover ? '✦ Scout' : 'Trip setup'}</span>
      <h1>{isDiscover ? <>Let's find <em>your destination</em></> : <>Start with <em>your destination</em></>}</h1>
      {isDiscover ? (
        <>
          <p className="lede">Tell Scout what matters to you, and it'll narrow down destinations that fit.</p>
          <div className="chat-log" aria-live="polite">
            {messages.map(message => (
              <div key={message.id} className={`chat-row chat-row-${message.role}`}>
                <div className={`chat-bub chat-bub-${message.role}`} style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
              </div>
            ))}
            {busy && <div className="think" role="status">Scout is thinking…</div>}
            {!busy && quickReplies.length > 0 && (
              <div className="chat-chip-row" aria-label="Suggested traveler replies">
                {quickReplies.map(reply => <button type="button" className="chip chat-chip-long" key={reply.value} onClick={() => sendDiscover(reply)}>{reply.label}</button>)}
              </div>
            )}
            {commandSnapshot?.trip_state?.stage === 'recommended' && (
              <button type="button" className="btn btn-primary" onClick={() => navigate('/destinations?next=preview')}>See destinations →</button>
            )}
          </div>
          <div className="chat-input-bar">
            <input className="chat-input" aria-label="Message Scout" placeholder="Tell Scout about your trip…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') sendDiscover(); }} />
            <button type="button" className="chat-send" onClick={() => sendDiscover()} disabled={busy} aria-label="Send">→</button>
          </div>
        </>
      ) : (
        <>
          <p className="lede">Tell us where you are going. We’ll take you straight to planning—no matching needed.</p>
          <div className="chat-log" aria-live="polite">
            <div className="chat-row chat-row-assistant">
              <div className="chat-bub chat-bub-assistant">Where are you going?</div>
            </div>
            {result && <div className="chat-row chat-row-assistant"><div className="chat-bub chat-bub-assistant">{result.message}</div></div>}
            {result?.trip?.trip_state?.active_agent === 'guide' && <button type="button" className="btn btn-primary" onClick={() => navigate('/trip-preview')}>Continue to planning →</button>}
          </div>
          <div className="chat-input-bar">
            <input className="chat-input" aria-label="Destination" placeholder="e.g. Coorg, Karnataka" value={destination} onChange={event => setDestination(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitDestination(); }} />
            <button type="button" className="chat-send" onClick={submitDestination} aria-label="Start planning">→</button>
          </div>
        </>
      )}
      {error && <div className="price-evidence state-unsafe" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={isDiscover ? () => sendDiscover(lastCommand.current?.message ?? '') : submitDestination}>Try again</button></div>}
    </div>
  );
}
