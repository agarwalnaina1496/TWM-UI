import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS, QUICK_REPLIES } from '../data/entryCommandFixtures.js';
import { newIdempotencyKey } from '../lib/tripApi.js';
import { useThinkingMessage } from '../hooks/useThinkingMessage.js';
import { useGuidePlanning } from '../hooks/useGuidePlanning.js';
import { trackEvent } from '../lib/analytics.js';
import '../styles/chat.css';

let nextMessageId = 1;

// Shared opener for both entry paths — only what follows it differs.
const SCOUT_WELCOME = "Hey there! I'm Scout. Tell me about the trip you have in mind.";
const DISCOVER_WELCOME = `${SCOUT_WELCOME} I can help you find destinations that fit and explain why.`;
const DISCOVER_ORIGIN_PROMPT = 'To start, where will you be traveling from?';
const KNOWN_DESTINATION_WELCOME = `${SCOUT_WELCOME} I can help you plan your trip.`;
const KNOWN_DESTINATION_PROMPT = 'Where are you headed?';

export default function JourneyEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { commandSnapshot, sendTripCommand } = useTrip();
  const intent = params.get('intent');
  const isDiscover = intent === ENTRY_INTENTS.DISCOVER;
  const [destination, setDestination] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { maybeAdvancePlaces, generateItinerary, generating } = useGuidePlanning(sendTripCommand, navigate);
  const initialized = useRef(false);
  // discover_entry establishes Meridian ownership on the traveler's first
  // message; every message after that is a plain traveler_message to the
  // specialist already owning the trip. No Backend command — and so no trip
  // creation — happens before that first send. Meridian/Guide ask for
  // whatever context they still need themselves (shared trip_context, same
  // dynamic clarification loop Scout uses) — the UI never pre-collects it.
  const entered = useRef(false);
  const lastCommand = useRef(null);

  // Hardcoded per-intent greeting shown immediately, with no Backend call —
  // the owning specialist only gets involved once the traveler actually
  // sends something.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setMessages(previous => [
      ...previous,
      { id: nextMessageId++, role: 'assistant', text: isDiscover ? DISCOVER_WELCOME : KNOWN_DESTINATION_WELCOME },
      { id: nextMessageId++, role: 'assistant', text: isDiscover ? DISCOVER_ORIGIN_PROMPT : KNOWN_DESTINATION_PROMPT },
    ]);
  }, [isDiscover]);

  // planning_started fires once, right as the known-destination journey
  // actually begins (mounting this screen with that intent) — this path has
  // no separate "first message" gate the way Discover does.
  useEffect(() => {
    if (isDiscover) return;
    trackEvent('planning_started', { planning_entry: 'known_destination' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendDiscover(reply = input) {
    const value = (typeof reply === 'string' ? reply : reply.value).trim();
    if (!value || busy) return;
    const idempotencyKey = lastCommand.current?.message === value ? lastCommand.current.idempotencyKey : newIdempotencyKey();
    lastCommand.current = { message: value, idempotencyKey };
    const isFirstSend = !entered.current;
    setInput('');
    setBusy(true);
    setError(null);
    setMessages(previous => [...previous, { id: nextMessageId++, role: 'user', text: value }]);
    try {
      const command = entered.current ? 'traveler_message' : 'discover_entry';
      const response = await sendTripCommand(command, { message: value, idempotencyKey });
      entered.current = true;
      if (isFirstSend) trackEvent('discovery_started', { entry_method: 'journey_entry' });
      if (response.message) setMessages(previous => [...previous, { id: nextMessageId++, role: 'assistant', text: response.message }]);
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // Continues Guide's pre-itinerary conversation entirely in chat: the first
  // send starts the trip via known_destination_entry, every send after that
  // (preferences, duration, clarification answers) is a plain
  // traveler_message. Once Guide's places are settled with nothing left to
  // clarify, silently advance to a day plan so "Generate detailed itinerary"
  // can appear without a separate Plan Builder screen.
  async function submitDestination(override) {
    const value = (override ?? destination).trim();
    if (!value || busy) return;
    const isFirstSend = !entered.current;
    setDestination('');
    setBusy(true);
    setError(null);
    setMessages(previous => [...previous, { id: nextMessageId++, role: 'user', text: value }]);
    try {
      const response = entered.current
        ? await sendTripCommand('traveler_message', { message: value })
        : await sendTripCommand('known_destination_entry', { destination: value });
      entered.current = true;
      if (isFirstSend) trackEvent('destination_provided', { destination_source: 'user_input' });
      if (response.message) setMessages(previous => [...previous, { id: nextMessageId++, role: 'assistant', text: response.message }]);
      const plannerState = response.trip.trip_state.planner_state;
      if (plannerState) {
        const advanced = await maybeAdvancePlaces(plannerState);
        if (advanced?.message) setMessages(previous => [...previous, { id: nextMessageId++, role: 'assistant', text: advanced.message }]);
      }
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const awaiting = commandSnapshot?.trip_state?.matcher_state?.conversation_context?.awaiting;
  const quickReplies = (QUICK_REPLIES[awaiting] || []).map(value => ({ label: value, value }));
  const guideAwaiting = commandSnapshot?.trip_state?.planner_state?.conversation_context?.awaiting;
  const guideQuickReplies = QUICK_REPLIES[guideAwaiting] || [];
  const guideDayPlanReady = (commandSnapshot?.trip_state?.planner_state?.day_plan?.length || 0) > 0;
  const thinkingMessage = useThinkingMessage(busy);

  return (
    <div className="chat-page chat-screen">
      <div className="chat-context-bar" role="status">
        <span aria-hidden="true">ⓘ</span>Scout is here to help with your trip.
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
            {busy && <div className="think" role="status">{thinkingMessage}</div>}
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
            {messages.map(message => (
              <div key={message.id} className={`chat-row chat-row-${message.role}`}>
                <div className={`chat-bub chat-bub-${message.role}`} style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
              </div>
            ))}
            {busy && <div className="think" role="status">{thinkingMessage}</div>}
            {!busy && guideQuickReplies.length > 0 && (
              <div className="chat-chip-row" aria-label="Suggested traveler replies">
                {guideQuickReplies.map(reply => <button type="button" className="chip chat-chip-long" key={reply} onClick={() => submitDestination(reply)}>{reply}</button>)}
              </div>
            )}
            {!busy && guideDayPlanReady && (
              <button type="button" className="btn btn-primary" disabled={generating} onClick={generateItinerary}>Generate detailed itinerary →</button>
            )}
          </div>
          <div className="chat-input-bar">
            <input className="chat-input" aria-label="Destination" placeholder="e.g. Coorg, Karnataka" value={destination} onChange={event => setDestination(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitDestination(); }} />
            <button type="button" className="chat-send" onClick={() => submitDestination()} disabled={busy} aria-label="Start planning">→</button>
          </div>
        </>
      )}
      {error && <div className="price-evidence state-unsafe" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={isDiscover ? () => sendDiscover(lastCommand.current?.message ?? '') : () => submitDestination()}>Try again</button></div>}
    </div>
  );
}
