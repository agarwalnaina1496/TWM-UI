import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { AWAITING_INPUT_LABELS, DESTINATION_INPUT_LABEL, ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { newIdempotencyKey } from '../lib/tripApi.js';
import { planReady } from '../hooks/useGuidePlanning.js';
import { trackEvent } from '../lib/analytics.js';
import { isTripEmpty } from '../lib/tripLifecycle.js';
import BackToTrip from '../components/BackToTrip.jsx';
import ChatSection from '../features/chat/ChatSection.jsx';
import ScreenHeader from '../components/ui/ScreenHeader.jsx';
import { TRIP_ID_PARAM, syncUrlParamsSilently, withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../hooks/useTripFromUrl.js';

// TWM-190 (regression fix): a live, trip-less entry (via Header/DashboardHome's
// "Discover Destination"/"Plan a Trip") lands here directly with ?intent= and
// no trip yet — this used to be JourneyEntry.jsx's own separate chat
// implementation. Merged into this single conversational surface instead of
// a second one, per the shared opener/copy JourneyEntry.jsx used to own.
const SCOUT_WELCOME = "Hey there! I'm Scout. Tell me about the trip you have in mind.";
const DISCOVER_WELCOME = `${SCOUT_WELCOME} I can help you find destinations that fit and explain why.`;
const DISCOVER_ORIGIN_PROMPT = 'To start, where will you be traveling from?';
const KNOWN_DESTINATION_WELCOME = `${SCOUT_WELCOME} I can help you plan your trip.`;
const KNOWN_DESTINATION_PROMPT = 'Where are you headed?';

export default function ScoutChat() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { commandSnapshot, sendTripCommand, startTrip, currentTripId, tripLoadStatus } = useTrip();
  // TWM-185/TWM-221: reload/bookmark/deep-link safe — points currentTripId at
  // the URL's trip so the ['trip', id] query resolves the right one.
  const urlTripId = useTripFromUrl();
  const intent = params.get('intent');
  // No trip anywhere yet (not on the URL, not already tracked this
  // session) — a genuine live entry, not a resume. Only ever paired with an
  // ?intent= (Discover/Known Destination); ScoutChat's other trip-less
  // entry point (?entry=advice) has no intent and falls through to the
  // existing generic cold-open below, unchanged.
  const isFreshEntry = !urlTripId && !currentTripId;
  // Session-wide flavor — intent stays on the URL for this whole live-entry
  // conversation (a genuine resume via /scout-chat carries no intent at
  // all), unlike isFreshEntry which flips false right after the first send
  // creates the trip.
  const isDiscoverEntry = intent === ENTRY_INTENTS.DISCOVER;
  const isKnownDestinationEntry = intent === ENTRY_INTENTS.KNOWN_DESTINATION;
  const isFreshDiscover = isFreshEntry && isDiscoverEntry;
  const isFreshKnownDestination = isFreshEntry && isKnownDestinationEntry;
  const lastIdemRef = useRef(null);
  // Guards the very first send of a genuinely fresh entry — only that one
  // send uses startTrip(); every send after (including this same mount's
  // second message) is a plain traveler_message on the now-existing trip.
  const entered = useRef(false);

  // TWM-233: read + clear `?msg=` exactly once, synchronously during render
  // (not an effect) -- guarantees the URL is cleared before ChatConversation's
  // own mount effect can auto-send it, so a reload mid-flight can't replay it
  // a second time.
  const initialMessageRef = useRef(undefined);
  if (initialMessageRef.current === undefined) {
    const raw = params.get('msg')?.trim();
    initialMessageRef.current = raw || null;
    if (raw) {
      const syncedParams = new URLSearchParams(params);
      syncedParams.delete('msg');
      syncUrlParamsSilently(syncedParams);
    }
  }

  async function onSend(text) {
    const idempotencyKey = lastIdemRef.current?.message === text ? lastIdemRef.current.idempotencyKey : newIdempotencyKey();
    lastIdemRef.current = { message: text, idempotencyKey };
    let response;
    if (!entered.current && (isFreshDiscover || isFreshKnownDestination)) {
      // TWM-189/190: the very first send of a genuinely fresh entry creates
      // the trip and sends the message in one call. Entry-command-collapse:
      // both flavors send the traveler's own raw message under one
      // entry_intent — Guide's own extraction (guide.md) is the only thing
      // that ever determines `destinations`.
      response = await startTrip({
        entryIntent: intent === ENTRY_INTENTS.DISCOVER ? 'discover' : 'known_destination',
        message: text,
        idempotencyKey,
      });
      // TWM-233: anchor the new trip's id into the URL the instant it
      // exists, via the raw History API (not navigate(), which would remount
      // this route on /journey-entry — App.jsx's `key={location.search}`).
      const syncedParams = new URLSearchParams(params);
      syncedParams.delete('msg');
      syncedParams.set(TRIP_ID_PARAM, response.trip.id);
      syncUrlParamsSilently(syncedParams);
      trackEvent(
        intent === ENTRY_INTENTS.DISCOVER ? 'discovery_started' : 'destination_provided',
        intent === ENTRY_INTENTS.DISCOVER ? { entry_method: 'journey_entry' } : { destination_source: 'user_input' }
      );
    } else {
      response = await sendTripCommand('traveler_message', { message: text, idempotencyKey });
    }
    entered.current = true;
    return response;
  }

  function onPlanReady(response) {
    if (!planReady(response.trip.plan)) return false;
    // TWM-234: Guide generated the complete plan in this turn — hand off to
    // the unified Dashboard shell (same place a resumed trip already lands),
    // not the standalone Plan Builder page. OverviewTab embeds Plan Builder
    // itself once the refetched TripView shows a day_plan, so no state needs
    // to travel with the navigation.
    navigate(withTripId('/dashboard', response.trip.id));
    return true;
  }

  const guideAwaiting = commandSnapshot?.plan?.awaiting;

  // TWM-173: a refresh must not show the cold-open greeting again once real
  // trip_context already exists. Only a genuinely fresh entry passes its own
  // opening lines; ChatSection recaps a resumed trip itself (TWM-190: Guide's
  // recap is a synthesized one, since Guide's conversation_context has no
  // verbatim last-message field the way Meridian's does).
  let greeting;
  if (isFreshDiscover) {
    greeting = [DISCOVER_WELCOME, DISCOVER_ORIGIN_PROMPT];
  } else if (isFreshKnownDestination) {
    greeting = [KNOWN_DESTINATION_WELCOME, KNOWN_DESTINATION_PROMPT];
  }

  // planning_started fires once, right as the known-destination journey
  // actually begins (mounting this screen with that intent) — this path has
  // no separate "first message" gate the way Discover does.
  useEffect(() => {
    if (!isFreshKnownDestination) return;
    trackEvent('planning_started', { planning_entry: 'known_destination' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TWM-188: a direct/deep-link/stale-tab navigation to an empty
  // (trip_context-less) trip has nothing real to render here — redirect
  // home instead of showing the cold-open greeting for an orphan record.
  // Gated on a URL tripId so a genuinely fresh, not-yet-created trip
  // reached without one (the normal cold-open path) is unaffected.
  useEffect(() => {
    if (!urlTripId || tripLoadStatus !== 'ready' || !isTripEmpty(commandSnapshot)) return;
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTripId, tripLoadStatus, commandSnapshot, navigate]);

  // TWM-190 (regression fix): a known-destination *entry* session (the whole
  // live conversation up to Guide completing the plan, not just its first
  // turn — intent stays on the URL the entire time) gets the per-question
  // destination composer JourneyEntry.jsx used to own (TWM-183) instead of
  // the generic one. A genuine resume (/scout-chat, no intent) never gets
  // this — matches JourneyEntry.jsx's old scope exactly.
  const isGuideFlavored = isKnownDestinationEntry;
  const destinationInputLabel = (guideAwaiting && AWAITING_INPUT_LABELS[guideAwaiting]) || DESTINATION_INPUT_LABEL;

  return (
    <ChatSection
      layout="page"
      top={<BackToTrip />}
      header={(
        <ScreenHeader
          eyebrow={isKnownDestinationEntry ? 'Trip setup' : '✦ Scout'}
          title={isKnownDestinationEntry
            ? <>Start with <em>your destination</em></>
            : isDiscoverEntry
              ? <>Let's find <em>your destination</em></>
              : <>Tell Scout <em>in your own words</em></>}
          lede={isKnownDestinationEntry
            ? "Tell us where you are going. We'll take you straight to planning — no matching needed."
            : isDiscoverEntry
              ? "Tell Scout what matters to you, and it'll narrow down destinations that fit."
              : 'Scout keeps the nuance in what you say, asks only for material gaps, and hands the trip to the right specialist.'}
        />
      )}
      greeting={greeting}
      initialMessage={initialMessageRef.current}
      onSend={onSend}
      onPlanReady={onPlanReady}
      // TWM-234: hand off into the unified Dashboard shell -- OverviewTab
      // embeds Destinations itself once the refetched TripView reaches
      // stage recommended/matched, same as a resumed trip.
      onSeeDestinations={() => navigate(withTripId('/dashboard', urlTripId || currentTripId))}
      inputLabelOverride={isGuideFlavored ? destinationInputLabel : undefined}
      sendLabelOverride={isGuideFlavored ? 'Start planning' : undefined}
    />
  );
}
