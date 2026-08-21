import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { QUICK_REPLIES } from '../data/entryCommandFixtures.js';
import { newIdempotencyKey } from '../lib/tripApi.js';
import { useThinkingMessage } from '../hooks/useThinkingMessage.js';
import { planReady } from '../hooks/useGuidePlanning.js';
import { buildRecapTurn, didHandoffOccur } from '../lib/discoverChat.js';
import { buildPlanRecapTurn } from '../lib/planChat.js';
import { isTripEmpty } from '../lib/tripLifecycle.js';
import BackToTrip from '../components/BackToTrip.jsx';
import FactsPanel from '../components/FactsPanel.jsx';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../lib/useTripFromUrl.js';
import '../styles/chat.css';

let nextId = 1;
const COLD_OPEN = "Hey there! I'm Scout. Tell me about the trip you have in mind — a question, a rough idea, or the whole plan — and I'll take it from there.";
// TWM-190: ScoutChat.jsx is the single conversational surface for both
// specialists now — the note names whichever one the trip actually handed
// off to, not always Meridian.
const HANDOFF_NOTES = {
  meridian: '→ Bringing in Meridian, who handles destination matching.',
  guide: '→ Bringing in Guide, who builds your day-by-day plan.',
};

export default function ScoutChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { commandSnapshot, sendTripCommand, tripLoadStatus, openTrip } = useTrip();
  // TWM-185: reload/bookmark/deep-link safe — a full fetch, since this page
  // reads matcher_state/planner_state to decide what to do next and can't
  // safely act on a possibly-thin cached record.
  const urlTripId = useTripFromUrl(openTrip);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const initialized = useRef(false);
  const lastCommand = useRef(null);
  const previousAgent = useRef(null);

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
      const response = await sendTripCommand('traveler_message', { message: text, idempotencyKey });
      const plannerState = response.trip.trip_state.planner_state;
      if (planReady(plannerState)) {
        // Guide generated the complete plan in this turn — go straight to
        // the unified Plan Builder instead of showing the message here,
        // this component unmounts on navigate. Same handoff as JourneyEntry.
        navigate(withTripId('/trip-preview', response.trip.id), { state: { guideMessage: response.message } });
        return;
      }
      say('assistant', response.message);
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const activeAgent = commandSnapshot?.trip_state?.active_agent;
  const stage = commandSnapshot?.trip_state?.stage;
  const matcherAwaiting = commandSnapshot?.trip_state?.matcher_state?.conversation_context?.awaiting;
  const guideAwaiting = commandSnapshot?.trip_state?.planner_state?.conversation_context?.awaiting;
  const awaiting = activeAgent === 'guide' ? guideAwaiting : matcherAwaiting;

  // TWM-173: a refresh must not show the cold-open greeting again once real
  // trip_context already exists — that reads as the product forgetting
  // everything the traveler already said. Waits for the trip to actually
  // finish loading so a fresh trip and a not-yet-loaded trip aren't
  // confused with each other.
  useEffect(() => {
    if (initialized.current || tripLoadStatus !== 'ready') return;
    initialized.current = true;
    // TWM-190: JourneyEntry.jsx sends the trip's first command itself
    // (discover_entry/known_destination_entry) and redirects here with the
    // already-completed exchange, rather than this page re-sending it —
    // render it directly instead of a cold-open/recap.
    const firstTurn = location.state?.firstTurn;
    if (firstTurn) {
      say('user', firstTurn.userMessage);
      if (firstTurn.responseMessage) say('assistant', firstTurn.responseMessage);
      return;
    }
    // TWM-190: Guide's recap is phrased for its planning context
    // (buildPlanRecapTurn, already built for TripPreview's now-retired
    // gating-chat branch) — Guide's conversation_context has no verbatim
    // last-message field the way Meridian's does, so this is a synthesized
    // recap rather than Guide's own last question echoed back.
    const recap = activeAgent === 'guide'
      ? buildPlanRecapTurn(commandSnapshot?.trip_state?.trip_context, { awaiting })
      : buildRecapTurn(commandSnapshot?.trip_state, { awaiting });
    say('assistant', recap || COLD_OPEN);
    const message = params.get('msg')?.trim();
    if (message) runAdvice(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus]);

  // TWM-188: a direct/deep-link/stale-tab navigation to an empty
  // (trip_context-less) trip has nothing real to render here — redirect
  // home instead of showing the cold-open greeting for an orphan record.
  // Gated on a URL tripId so a genuinely fresh, not-yet-created trip
  // reached without one (the normal cold-open path) is unaffected.
  useEffect(() => {
    if (!urlTripId || tripLoadStatus !== 'ready' || !isTripEmpty(commandSnapshot?.trip_state)) return;
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTripId, tripLoadStatus, commandSnapshot?.trip_state, navigate]);

  // Hand-off note fires exactly once, only on a real scout->specialist
  // transition — never on initial load of an already-owned trip.
  useEffect(() => {
    if (tripLoadStatus !== 'ready') return;
    if (didHandoffOccur(previousAgent.current, activeAgent)) say('system', HANDOFF_NOTES[activeAgent]);
    previousAgent.current = activeAgent;
  }, [tripLoadStatus, activeAgent]);

  function send() {
    const value = input.trim();
    if (!value || busy) return;
    setInput('');
    runAdvice(value);
  }

  const quickReplies = QUICK_REPLIES[awaiting] || [];
  const thinkingMessage = useThinkingMessage(busy);
  return (
    <div className="chat-page chat-screen">
      <BackToTrip />
      <div className="chat-context-bar" role="status"><span aria-hidden="true">ⓘ</span>Scout is here to help with your trip.</div>
      <span className="eyebrow">✦ Scout</span>
      <h1>Tell Scout <em>in your own words</em></h1>
      <p className="lede">Scout keeps the nuance in what you say, asks only for material gaps, and hands the trip to the right specialist.</p>
      <FactsPanel tripContext={commandSnapshot?.trip_state?.trip_context} />

      <div className="chat-log" aria-live="polite">
        {messages.map(message => (
          message.role === 'system' ? (
            <div key={message.id} className="chat-row chat-row-system"><span className="chat-system-note">{message.text}</span></div>
          ) : (
            <div key={message.id} className={`chat-row chat-row-${message.role}`}>
              <div className={`chat-bub chat-bub-${message.role}`} style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
            </div>
          )
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
      </div>

      <div className="chat-input-bar">
        <input type="text" className="chat-input" placeholder="Ask Scout a travel question…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') send(); }} />
        <button type="button" className="chat-send" onClick={send} disabled={busy} aria-label="Send">→</button>
      </div>
    </div>
  );
}
