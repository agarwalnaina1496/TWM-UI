import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { useThinkingMessage } from '../hooks/useThinkingMessage.js';
import { planReady } from '../hooks/useGuidePlanning.js';
import { trackEvent } from '../lib/analytics.js';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../lib/useTripFromUrl.js';
import '../styles/chat.css';

// TWM-190: this screen only owns the traveler's very first message now —
// everything after that (recap, follow-ups, quick-replies, completion
// handoff) lives on ScoutChat.jsx, the single conversational surface for
// both specialists. Previously this page maintained its own full chat
// transcript for the entire pre-recommended/pre-day_plan conversation,
// duplicating ScoutChat.jsx's UI; now it hands off immediately after the
// first command succeeds, carrying that exchange forward so ScoutChat
// renders it without re-sending it.
const DISCOVER_PROMPT = "Tell Scout what matters to you, and it'll narrow down destinations that fit.";
const KNOWN_DESTINATION_PROMPT = "Tell us where you are going. We'll take you straight to planning — no matching needed.";

export default function JourneyEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { startTrip, currentTripId, tripLoadStatus, openTrip } = useTrip();
  // TWM-185: reload/bookmark/deep-link safe for a trip that already exists
  // (see the redirect effect below) — a genuinely fresh entry (via Header/
  // DashboardHome's startNewTrip()) has no ?tripId= and no currentTripId,
  // so this simply no-ops then.
  const urlTripId = useTripFromUrl(openTrip);
  const intent = params.get('intent');
  const isDiscover = intent === ENTRY_INTENTS.DISCOVER;
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastValue = useRef('');
  // submit() already navigates itself once its command resolves — that
  // update to currentTripId would otherwise also satisfy the "trip already
  // exists" redirect effect below and fire a second, state-less
  // navigate(..., {replace:true}) that wipes out the firstTurn/guideMessage
  // state the first navigate just attached.
  const navigatedRef = useRef(false);

  // planning_started fires once, right as the known-destination journey
  // actually begins (mounting this screen with that intent) — this path has
  // no separate "first message" gate the way Discover does.
  useEffect(() => {
    if (isDiscover) return;
    trackEvent('planning_started', { planning_entry: 'known_destination' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A trip already exists for this session or URL (a resumed/refreshed
  // entry, or this same intent already sent a first message) — nothing
  // left for this screen to do, hand off to ScoutChat immediately rather
  // than reconstructing a second chat implementation here.
  useEffect(() => {
    if (navigatedRef.current) return;
    const tripId = urlTripId || currentTripId;
    if (tripLoadStatus !== 'ready' || !tripId) return;
    navigatedRef.current = true;
    navigate(withTripId('/scout-chat', tripId), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, urlTripId, currentTripId, navigate]);

  async function submit(override) {
    const text = (override ?? value).trim();
    if (!text || busy) return;
    lastValue.current = text;
    setValue('');
    setBusy(true);
    setError(null);
    try {
      // TWM-189: the first send creates the trip and sends the message in
      // one call (startTrip) — no bare create happens before it, and a
      // failure here leaves no trip at all, ready for "Try again" to
      // simply retry the same call.
      const response = isDiscover
        ? await startTrip('discover_entry', { message: text })
        : await startTrip('known_destination_entry', { destination: text });
      trackEvent(
        isDiscover ? 'discovery_started' : 'destination_provided',
        isDiscover ? { entry_method: 'journey_entry' } : { destination_source: 'user_input' }
      );
      navigatedRef.current = true;
      const plannerState = response.trip.trip_state.planner_state;
      if (!isDiscover && planReady(plannerState)) {
        // Guide generated the complete plan on this very first turn
        // (single-step generation) — go straight to the unified Plan
        // Builder, never through ScoutChat at all.
        navigate(withTripId('/trip-preview', response.trip.id), { state: { guideMessage: response.message } });
        return;
      }
      navigate(withTripId('/scout-chat', response.trip.id), {
        state: { firstTurn: { userMessage: text, responseMessage: response.message } },
      });
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
      setBusy(false);
    }
  }

  const thinkingMessage = useThinkingMessage(busy);

  return (
    <div className="chat-page chat-screen">
      <div className="chat-context-bar" role="status">
        <span aria-hidden="true">ⓘ</span>Scout is here to help with your trip.
      </div>
      <span className="eyebrow">{isDiscover ? '✦ Scout' : 'Trip setup'}</span>
      <h1>{isDiscover ? <>Let's find <em>your destination</em></> : <>Start with <em>your destination</em></>}</h1>
      <p className="lede">{isDiscover ? DISCOVER_PROMPT : KNOWN_DESTINATION_PROMPT}</p>
      {busy && <div className="think" role="status">{thinkingMessage}</div>}
      {error && (
        <div className="price-evidence state-unsafe" role="alert">
          {error} <button type="button" className="btn btn-ghost" onClick={() => submit(lastValue.current)}>Try again</button>
        </div>
      )}
      <div className="chat-input-bar">
        <input
          className="chat-input"
          aria-label={isDiscover ? 'Message Scout' : 'Destination'}
          placeholder={isDiscover ? 'Tell Scout about your trip…' : 'e.g. Coorg, Karnataka'}
          value={value}
          disabled={busy}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') submit(); }}
        />
        <button
          type="button"
          className="chat-send"
          onClick={() => submit()}
          disabled={busy}
          aria-label={isDiscover ? 'Send' : 'Start planning'}
        >→</button>
      </div>
    </div>
  );
}
