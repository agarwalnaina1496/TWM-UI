import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS, QUICK_REPLIES, AWAITING_INPUT_LABELS, DESTINATION_INPUT_LABEL } from '../data/entryCommandFixtures.js';
import { newIdempotencyKey } from '../lib/tripApi.js';
import { useThinkingMessage } from '../hooks/useThinkingMessage.js';
import { planReady } from '../hooks/useGuidePlanning.js';
import { trackEvent } from '../lib/analytics.js';
import { buildRecapTurn } from '../lib/discoverChat.js';
import FactsPanel from '../components/FactsPanel.jsx';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../lib/useTripFromUrl.js';
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
  const { commandSnapshot, sendTripCommand, tripLoadStatus, openTrip } = useTrip();
  // TWM-185: reload/bookmark/deep-link safe for the "resuming a
  // mid-conversation trip" case. The normal fresh-entry path (via Header/
  // DashboardHome's startNewTrip()) has no ?tripId= at all — this simply
  // no-ops then, exactly as it should for a genuinely new trip.
  useTripFromUrl(openTrip);
  const intent = params.get('intent');
  const isDiscover = intent === ENTRY_INTENTS.DISCOVER;
  const [destination, setDestination] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  // discover_entry establishes Meridian ownership on the traveler's first
  // message; every message after that is a plain traveler_message to the
  // specialist already owning the trip. No Backend command — and so no trip
  // creation — happens before that first send. Meridian/Guide ask for
  // whatever context they still need themselves (shared trip_context, same
  // dynamic clarification loop Scout uses) — the UI never pre-collects it.
  const entered = useRef(false);
  const lastCommand = useRef(null);
  // TWM-183: submitDestination optimistically clears the `destination`
  // input state before awaiting the network response — "Try again" must
  // resend the value that was actually submitted, not re-read the
  // now-cleared input, or its guard (`if (!value...) return;`) silently
  // no-ops. Mirrors the Discover path's own lastCommand ref pattern.
  const lastDestinationValue = useRef('');

  // Known-destination path keeps its original unconditional greeting — out
  // of scope for this story (Guide's chat, not Discover/Destinations).
  useEffect(() => {
    if (isDiscover || initialized.current) return;
    initialized.current = true;
    setMessages(previous => [
      ...previous,
      { id: nextMessageId++, role: 'assistant', text: KNOWN_DESTINATION_WELCOME },
      { id: nextMessageId++, role: 'assistant', text: KNOWN_DESTINATION_PROMPT },
    ]);
  }, [isDiscover]);

  // TWM-173: Discover's greeting must not reset to a cold open on a refresh
  // mid-conversation — a trip that already has real trip_context (the
  // traveler refreshed after sending at least one message) gets a recap
  // turn instead. Waits for the trip to actually finish loading so a fresh
  // trip and a not-yet-loaded trip aren't confused with each other.
  useEffect(() => {
    if (!isDiscover || initialized.current || tripLoadStatus !== 'ready') return;
    initialized.current = true;
    const recap = buildRecapTurn(commandSnapshot?.trip_state, { awaiting: commandSnapshot?.trip_state?.matcher_state?.conversation_context?.awaiting });
    setMessages(previous => (recap
      ? [...previous, { id: nextMessageId++, role: 'assistant', text: recap }]
      : [...previous,
        { id: nextMessageId++, role: 'assistant', text: DISCOVER_WELCOME },
        { id: nextMessageId++, role: 'assistant', text: DISCOVER_ORIGIN_PROMPT },
      ]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDiscover, tripLoadStatus]);

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
  // (preferences, duration, and the final "anything else?" answer) is a
  // plain traveler_message. Guide generates places and the day plan
  // together in a single step once that last question is answered — the
  // traveler then lands directly on the unified Plan Builder, never on
  // /dashboard from this chat.
  async function submitDestination(override) {
    const value = (override ?? destination).trim();
    if (!value || busy) return;
    const isFirstSend = !entered.current;
    lastDestinationValue.current = value;
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
      const plannerState = response.trip.trip_state.planner_state;
      if (planReady(plannerState)) {
        // Carry Guide's completion message forward — this component
        // unmounts on navigate, so it can't append it to the (now-gone)
        // chat log itself; TripPreview reads it from location.state.
        navigate(withTripId('/trip-preview', response.trip.id), { state: { guideMessage: response.message } });
        return;
      }
      if (response.message) setMessages(previous => [...previous, { id: nextMessageId++, role: 'assistant', text: response.message }]);
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
  // TWM-183: the input's accessible label/placeholder must track the
  // active question, not stay stuck on "Destination" past the first turn.
  const destinationInputLabel = (guideAwaiting && AWAITING_INPUT_LABELS[guideAwaiting]) || DESTINATION_INPUT_LABEL;
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
          <FactsPanel tripContext={commandSnapshot?.trip_state?.trip_context} />
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
              <button type="button" className="btn btn-primary" onClick={() => navigate(withTripId('/destinations?next=preview', commandSnapshot?.id))}>See destinations →</button>
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
          </div>
          <div className="chat-input-bar">
            <input className="chat-input" aria-label={destinationInputLabel.label} placeholder={destinationInputLabel.placeholder} value={destination} onChange={event => setDestination(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitDestination(); }} />
            <button type="button" className="chat-send" onClick={() => submitDestination()} disabled={busy} aria-label="Start planning">→</button>
          </div>
        </>
      )}
      {error && <div className="price-evidence state-unsafe" role="alert">{error} <button type="button" className="btn btn-ghost" onClick={isDiscover ? () => sendDiscover(lastCommand.current?.message ?? '') : () => submitDestination(lastDestinationValue.current)}>Try again</button></div>}
    </div>
  );
}
