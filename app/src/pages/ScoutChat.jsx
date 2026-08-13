import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { QUICK_REPLIES } from '../data/entryCommandFixtures.js';
import { newIdempotencyKey } from '../lib/tripApi.js';
import { useThinkingMessage } from '../hooks/useThinkingMessage.js';
import { useGuidePlanning } from '../hooks/useGuidePlanning.js';
import '../styles/chat.css';

let nextId = 1;

export default function ScoutChat() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { commandSnapshot, sendTripCommand } = useTrip();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { maybeAdvancePlaces, generateItinerary, generating } = useGuidePlanning(sendTripCommand, navigate);
  const initialized = useRef(false);
  const lastCommand = useRef(null);
  // The very first turn is a typed scout_entry (Scout entry, no rediscovery);
  // once a specialist owns the trip, follow-ups are plain traveler_message.
  const entered = useRef(false);

  function say(role, text) {
    if (text) setMessages(previous => [...previous, { id: nextId++, role, text }]);
  }

  async function runAdvice(message, { showUser = true } = {}) {
    const text = message.trim();
    if (!text || busy) return;
    const idempotencyKey = lastCommand.current?.message === text ? lastCommand.current.idempotencyKey : newIdempotencyKey();
    lastCommand.current = { message: text, idempotencyKey };
    if (showUser) say('user', text);
    setBusy(true);
    setError(null);
    try {
      const command = entered.current ? 'traveler_message' : 'scout_entry';
      const response = await sendTripCommand(command, { message: text, idempotencyKey });
      entered.current = true;
      say('assistant', response.message);
      const guideState = response.trip.trip_state.planner_state?.guide_session?.state;
      if (guideState) {
        const advanced = await maybeAdvancePlaces(guideState);
        if (advanced?.message) say('assistant', advanced.message);
      }
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    say('assistant', "Hey there! I'm Scout. Tell me about the trip you have in mind — a question, a rough idea, or the whole plan — and I'll take it from there.");
    const message = params.get('msg')?.trim();
    if (message) runAdvice(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    const value = input.trim();
    if (!value || busy) return;
    setInput('');
    runAdvice(value);
  }

  const activeAgent = commandSnapshot?.trip_state?.active_agent;
  const stage = commandSnapshot?.trip_state?.stage;
  const awaiting = commandSnapshot?.trip_state?.matcher_state?.conversation_context?.awaiting;
  const quickReplies = QUICK_REPLIES[awaiting] || [];
  const guideDayPlanReady = commandSnapshot?.trip_state?.planner_state?.guide_session?.state?.phase === 'DAY_PLAN_DRAFT';
  const thinkingMessage = useThinkingMessage(busy);
  return (
    <div className="chat-page chat-screen">
      <div className="chat-context-bar" role="status"><span aria-hidden="true">ⓘ</span>Scout is here to help with your trip.</div>
      <span className="eyebrow">✦ Scout</span>
      <h1>Tell Scout <em>in your own words</em></h1>
      <p className="lede">Scout keeps the nuance in what you say, asks only for material gaps, and hands the trip to the right specialist.</p>

      <div className="chat-log" aria-live="polite">
        {messages.map(message => (
          <div key={message.id} className={`chat-row chat-row-${message.role}`}>
            <div className={`chat-bub chat-bub-${message.role}`} style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
          </div>
        ))}
        {busy && <div className="think" role="status">{thinkingMessage}</div>}
        {!busy && quickReplies.length > 0 && (
          <div className="chat-chip-row" aria-label={`Suggested ${awaiting} replies`}>
            {quickReplies.map(reply => <button type="button" className="chip" key={reply} onClick={() => runAdvice(reply)}>{reply}</button>)}
          </div>
        )}
        {error && <div className="price-evidence state-unsafe" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={() => runAdvice(lastCommand.current?.message ?? '', { showUser: false })}>Try again</button></div>}
        {((activeAgent === 'meridian' && !awaiting) || stage === 'recommended') && (
          <button type="button" className="btn btn-primary" onClick={() => navigate('/destinations?next=preview')}>See destinations →</button>
        )}
        {activeAgent === 'guide' && guideDayPlanReady && (
          <button type="button" className="btn btn-primary" disabled={generating} onClick={generateItinerary}>Generate detailed itinerary →</button>
        )}
      </div>

      <div className="chat-input-bar">
        <input type="text" className="chat-input" placeholder="Ask Scout a travel question…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') send(); }} />
        <button type="button" className="chat-send" onClick={send} disabled={busy} aria-label="Send">→</button>
      </div>
    </div>
  );
}
