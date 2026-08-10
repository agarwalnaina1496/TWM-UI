import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS, QUICK_REPLIES } from '../data/entryCommandFixtures.js';
import { createEntryCommand, safeExecuteMockEntryCommand } from '../lib/mockTripCommands.js';
import '../styles/chat.css';

let nextId = 1;

export default function ScoutChat() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, commandSnapshot, applyMockCommandResponse } = useTrip();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const initialized = useRef(false);
  const lastCommand = useRef(null);

  function say(role, text) {
    if (text) setMessages(previous => [...previous, { id: nextId++, role, text }]);
  }

  function runAdvice(message, { showUser = true } = {}) {
    if (!message.trim() || busy) return;
    const command = createEntryCommand({
      intent: ENTRY_INTENTS.ADVICE,
      message: message.trim(),
      expectedVersion: commandSnapshot?.version ?? 1,
      idempotencyKey: lastCommand.current?.message === message.trim() ? lastCommand.current.idempotency_key : `fixture-${nextId}`,
    });
    lastCommand.current = command;
    if (showUser) say('user', message.trim());
    setBusy(true);
    setError(null);
    setTimeout(() => {
      const outcome = safeExecuteMockEntryCommand(command, trip);
      if (outcome.data) {
        applyMockCommandResponse(outcome.data);
        say('assistant', outcome.data.message);
      } else setError(outcome.error);
      setBusy(false);
    }, 350);
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    say('assistant', "I'm Scout. Tell me the travel question or concern you want advice on.");
    const message = params.get('msg')?.trim();
    if (message) runAdvice(message);
    // Fixture-backed entry intentionally initializes once; real resume belongs to TWM-110.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    const value = input.trim();
    if (!value || busy) return;
    setInput('');
    runAdvice(value);
  }

  const activeAgent = commandSnapshot?.trip_state?.active_agent;
  const awaiting = commandSnapshot?.trip_state?.matcher_state?.conversation_context?.awaiting;
  const quickReplies = QUICK_REPLIES[awaiting] || [];
  return (
    <div className="wrap chat-page">
      <span className="eyebrow">✦ Scout</span>
      <h1>Tell Scout <em>in your own words</em></h1>
      <p className="lede">Scout keeps the nuance in what you say, asks only for material gaps, and hands the trip to the right specialist.</p>

      <div className="chat-log" aria-live="polite">
        {messages.map(message => (
          <div key={message.id} className={`chat-row chat-row-${message.role}`}>
            <div className={`chat-bub chat-bub-${message.role}`} style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
          </div>
        ))}
        {busy && <div className="think" role="status">Scout is thinking…</div>}
        {!busy && quickReplies.length > 0 && (
          <div className="chat-chip-row" aria-label={`Suggested ${awaiting} replies`}>
            {quickReplies.map(reply => <button type="button" className="chip" key={reply} onClick={() => runAdvice(reply)}>{reply}</button>)}
          </div>
        )}
        {error && <div className="price-evidence state-unsafe" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={() => runAdvice(lastCommand.current?.message ?? '', { showUser: false })}>Try again</button></div>}
        {activeAgent === 'meridian' && <button type="button" className="btn btn-primary" onClick={() => navigate('/destinations?next=preview')}>Continue to destination discovery →</button>}
        {activeAgent === 'guide' && <button type="button" className="btn btn-primary" onClick={() => navigate('/trip-preview')}>Continue to planning →</button>}
      </div>

      <div className="chat-input-bar">
        <input type="text" className="chat-input" placeholder="Ask Scout a travel question…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') send(); }} />
        <button type="button" className="chat-send" onClick={send} disabled={busy} aria-label="Send">→</button>
      </div>
      <small>Fixture-backed Scout response — no Backend or agent call was made.</small>
    </div>
  );
}
