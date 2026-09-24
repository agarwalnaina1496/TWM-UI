import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { planBuilderSummary } from '../lib/guidePlanAdapter.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { isTripEmpty } from '../lib/tripLifecycle.js';
import BackToTrip from '../components/BackToTrip.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import PaceMeter from '../components/ui/PaceMeter.jsx';
import ScreenHeader from '../components/ui/ScreenHeader.jsx';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../hooks/useTripFromUrl.js';
import '../styles/preview.css';

const REOPEN_DESTINATION_MESSAGE = 'I want to change my destination and explore other options.';
const REOPEN_STEPS = ['Stepping back from your current plan', 'Bringing in Meridian, who handles destination matching', 'Finding fresh options'];

// Shared by the gating-question screen and the chat drawer — both are a
// plain free-text message to Guide, just with a different placeholder and
// destination for the trimmed value.
function FreeTextComposer({ value, onChange, onSubmit, placeholder, pending }) {
  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }
  return (
    <>
      <input
        aria-label="Message Guide"
        value={value}
        disabled={pending}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') submit(); }}
      />
      <button type="button" className="btn btn-primary" disabled={pending || !value.trim()} onClick={submit}>Send</button>
    </>
  );
}

// The single unified Plan Builder screen for both entry paths (known
// destination and discover). Guide generates places and the day plan
// together in one step — there is no separate approve-places screen at any
// point, and this screen is the real destination for both paths (the
// known-destination path used to bypass it entirely and land on /dashboard).
//
// TWM-190: reached only once Guide has produced a day_plan — the still-
// gating conversation (previously this page's own inline !planReady chat
// branch) now lives on ScoutChat.jsx, the single conversational surface for
// both specialists. The boot effect below redirects there instead of
// rendering a second chat implementation whenever it finds Guide still
// gating on trip context.
export default function TripPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { commandSnapshot, sendTripCommand, tripLoadStatus } = useTrip();
  // TWM-185/TWM-221: reload/bookmark/deep-link safe — points currentTripId at
  // the URL's trip so the ['trip', id] query resolves the right one.
  const urlTripId = useTripFromUrl();

  const view = commandSnapshot;
  const plan = view?.plan;
  const frozenPlan = plan?.frozen;
  const awaiting = plan?.awaiting;
  const places = plan?.places || [];
  const dayPlan = plan?.day_plan || [];
  // day_plan is only ever produced alongside places in the same single-step
  // turn, so its presence alone signals a generated plan — a subsequent
  // edit can legitimately empty out places within a day without un-generating
  // the plan itself.
  const planReady = dayPlan.length > 0;

  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const [pending, setPending] = useState(false);
  // A Guide message carried over from the chat turn that completed the plan
  // (JourneyEntry/ScoutChat navigate here with it in location.state, since
  // this component mounting fresh would otherwise lose it) — falls back to
  // '' so the local per-edit message below can still own this state.
  const [message, setMessage] = useState(location.state?.guideMessage || '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState(null);
  // TWM-188 item 3: set once the reopen request comes back asking the
  // traveler to choose revisit-existing vs. start-fresh, instead of the
  // backend silently picking one for a trip that already has recommendations.
  const [reopenChoicePending, setReopenChoicePending] = useState(false);
  const bootStarted = useRef(false);
  const trackedPlanBuilderView = useRef(false);
  // Best-effort distinction for planning_entry — a selected recommendation
  // means Discover led here; otherwise it's a known-destination entry.
  const planningEntry = view?.lifecycle?.selected_option ? 'discovered_destination' : 'known_destination';

  // Already frozen (e.g. the traveler navigated back after approving) — Guide
  // never reruns, so skip straight to the dashboard. TripDashboard.jsx owns
  // triggering the (also idempotent) Atlas itinerary generation from there.
  useEffect(() => {
    if (!frozenPlan) return;
    navigate(withTripId('/dashboard', commandSnapshot?.id), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenPlan, navigate]);

  // TWM-188: a direct/deep-link/stale-tab navigation to an empty
  // (trip_context-less) trip has nothing real to render here — redirect
  // home instead of booting Guide against a trip that's really an orphan.
  // Gated on a URL tripId so a genuinely fresh, not-yet-created trip
  // reached without one is unaffected.
  useEffect(() => {
    if (!urlTripId || tripLoadStatus !== 'ready' || !isTripEmpty(view)) return;
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTripId, tripLoadStatus, view, navigate]);

  // Bootstraps the real Guide session for the discover path (the
  // known-destination path already starts Guide from JourneyEntry's chat
  // before navigating here). Must wait for the Backend-authoritative trip
  // to finish loading first — commandSnapshot reads as empty on the very
  // first render, and firing start_planning against that transient empty
  // state would wrongly restart an already-in-progress Guide session.
  useEffect(() => {
    if (tripLoadStatus !== 'ready') return;
    // TWM-188: when the guard above is about to redirect this exact trip
    // home, don't also boot Guide against it in the same commit.
    if (frozenPlan || bootStarted.current || (urlTripId && isTripEmpty(view))) return;
    if (plan && dayPlan.length > 0) {
      setBootStatus('ready');
      return;
    }
    if (plan && (places.length || awaiting)) {
      // TWM-190: Guide already owns this trip but hasn't produced a
      // day_plan yet — that gating conversation lives on ScoutChat now,
      // not this page's retired inline chat branch.
      navigate(withTripId('/scout-chat', commandSnapshot?.id), { replace: true });
      return;
    }
    bootStarted.current = true;
    setBootStatus('booting');
    (async () => {
      try {
        const response = await sendTripCommand('start_planning');
        const nextPlan = response.trip?.plan;
        if (!nextPlan?.day_plan?.length) {
          // Guide asked a gating question instead of generating the plan on
          // this turn — hand off to ScoutChat rather than rendering a
          // second, retired chat implementation here.
          navigate(withTripId('/scout-chat', response.trip?.id ?? commandSnapshot?.id), { replace: true });
          return;
        }
        if (response.message) setMessage(response.message);
        setBootStatus('ready');
      } catch (error) {
        trackFailure('plan_builder', error);
        setBootStatus('error');
        setBootError(error.message || 'Could not start planning.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, frozenPlan]);

  useEffect(() => {
    if (trackedPlanBuilderView.current || bootStatus !== 'ready' || !planReady) return;
    trackedPlanBuilderView.current = true;
    trackEvent('plan_builder_viewed', { planning_entry: planningEntry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootStatus, planReady]);

  async function removePlace(place) {
    setPending(true);
    setMessage('');
    try {
      const response = await sendTripCommand('remove_place', { place_name: place });
      setMessage(response.message || '');
      trackEvent('plan_builder_edit', { edit_type: 'remove', planning_entry: planningEntry });
    } catch (error) {
      setMessage(error.message || 'That change could not be applied. The plan shown is now the latest saved version.');
    } finally {
      setPending(false);
    }
  }

  async function sendChat(text) {
    setPending(true);
    setMessage('');
    try {
      const response = await sendTripCommand('traveler_message', { message: text });
      setMessage(response.message || '');
      trackEvent('plan_builder_edit', { edit_type: 'chat', planning_entry: planningEntry });
    } catch (error) {
      setMessage(error.message || 'That change could not be applied. The plan shown is now the latest saved version.');
    } finally {
      setPending(false);
    }
  }

  function generate() {
    setPending(true);
    setMessage('');
    trackEvent('itinerary_generation_started', { generation_trigger: 'plan_builder' });
    sendTripCommand('approve_plan')
      .catch(error => { trackFailure('itinerary_generation', error); setMessage(error.message || 'Could not generate the detailed itinerary.'); })
      .finally(() => setPending(false));
    // Freezing navigates via the frozenPlan effect above once commandSnapshot updates.
  }

  // TWM-174: wires Guide's reopen_destination_discovery (already built
  // Backend-side, TWM-110) to a real UI affordance. A deterministic,
  // explicit message — not raw free text — since this is a UI-triggered
  // action, not an ambiguous traveler utterance to interpret. Guide still
  // makes the judgment call per its own prompt rules; if it asks a
  // clarifying question instead of reversing (ambiguous per its own
  // criteria), that response is shown inline rather than assumed to have
  // succeeded.
  async function reopenDestinationDiscovery() {
    setReversing(true);
    setReversalError(null);
    trackEvent('reopen_destination_discovery_triggered', { source: 'plan_builder_reversal' });
    try {
      const response = await sendTripCommand('traveler_message', { message: REOPEN_DESTINATION_MESSAGE });
      const nextView = response.trip;
      const awaiting = nextView?.plan?.awaiting;
      // TWM-188 item 3: a trip with an existing recommendation list gets a
      // choice prompt instead of an immediate reversal — stage/active_agent
      // don't change yet, so route on `awaiting`, not on stage.
      if (awaiting === 'destination_reopen_choice') {
        setReopenChoicePending(true);
        setMessage(response.message || '');
        return;
      }
      // No prior recommendations existed — the reversal already happened in
      // this same command. Navigate off the stage actually returned rather
      // than assuming /destinations for every reversal (matching -> /scout-chat).
      if (nextView?.lifecycle?.stage === 'matching') {
        navigate(withTripId('/scout-chat', response.trip?.id ?? commandSnapshot?.id));
        return;
      }
      setMessage(response.message || '');
    } catch (error) {
      setReversalError(error.message || 'Could not reconsider the destination.');
    } finally {
      setReversing(false);
    }
  }

  // TWM-188 item 3: resolves the traveler's revisit-vs-fresh choice once
  // prompted above. "fresh" reuses the same full-page transition as an
  // immediate reversal (a new Meridian conversation is genuinely starting);
  // "revisit" is a near-instant stage flip back to the existing list, so it
  // doesn't borrow that "Finding new matches" framing.
  async function resolveReopenChoice(command) {
    setReversalError(null);
    if (command === 'reopen_destination_fresh') setReversing(true);
    else setPending(true);
    try {
      const response = await sendTripCommand(command);
      const nextView = response.trip;
      const destination = nextView?.lifecycle?.stage === 'recommended' ? '/destinations' : '/scout-chat';
      navigate(withTripId(destination, response.trip?.id ?? commandSnapshot?.id));
    } catch (error) {
      setReversalError(error.message || 'Could not reconsider the destination.');
    } finally {
      setReversing(false);
      setPending(false);
    }
  }

  if (reversing) {
    return (
      <main className="wrap plan-builder">
        <HonestTransition steps={REOPEN_STEPS} label="Finding new matches" />
      </main>
    );
  }

  if (bootStatus === 'error') {
    return (
      <main className="wrap plan-builder">
        <BackToTrip />
        <ErrorBanner message={<><strong>Planning could not start</strong><span>{bootError}</span></>} />
      </main>
    );
  }

  if (bootStatus !== 'ready' || !plan) {
    return (
      <main className="wrap plan-builder">
        <BackToTrip />
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Guide is drafting your plan…</div>
      </main>
    );
  }

  // TWM-190: this page is only ever reached once Guide has produced a
  // day_plan (see the boot effect above and its upstream callers in
  // Destinations.jsx/ScoutChat.jsx/JourneyEntry.jsx) — the still-gating
  // case now redirects to ScoutChat instead of rendering here.
  const summary = planBuilderSummary(view);

  return (
    <main className="wrap plan-builder">
      <BackToTrip />
      <ScreenHeader
        eyebrow="Guide Plan Builder"
        title={<>{summary.destinationLabel || 'Your trip'} <em>| {summary.durationDays} days</em></>}
        lede="Shape the places and day pace together. Dates can stay open until you book."
      />

      <section className="plan-summary" aria-label="Plan summary">
        <div><strong>{summary.destinationCount}</strong><span>destinations</span></div>
        <div><strong>{summary.placeCount}</strong><span>planned places</span></div>
        <div><strong>{summary.durationDays}</strong><span>days</span></div>
      </section>

      {message && <div className="revision-message" role="status">{message}</div>}
      {reversalError && <ErrorBanner message={reversalError} />}
      {reopenChoicePending && (
        <div className="reversal-choice" role="group" aria-label="Choose how to reopen destination discovery">
          <button type="button" className="btn btn-ghost" disabled={pending || reversing} onClick={() => resolveReopenChoice('reopen_destination_revisit')}>
            Revisit my existing options
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending || reversing} onClick={() => resolveReopenChoice('reopen_destination_fresh')}>
            Start a fresh search
          </button>
        </div>
      )}

      <section className={`day-timeline${pending ? ' plan-busy' : ''}`} aria-label="Day plan" aria-busy={pending}>
        {dayPlan.map((dayEntry, dayIndex) => (
          <div className="timeline-day" key={dayEntry.day_number}>
            {dayIndex > 0 && <div className="timeline-connector" aria-hidden="true" />}
            <article className="day-card">
              <header className="day-card-head">
                <div className="day-card-title">
                  <span className="daynum">{dayEntry.day_number}</span>
                  <div><h2>Day {dayEntry.day_number}</h2><PaceMeter pace={dayEntry.pace} /></div>
                </div>
              </header>
              {dayEntry.buffer_note && <p className="buffer-note">{dayEntry.buffer_note}</p>}
              <ol className="plan-list">
                {dayEntry.places.map((place, placeIndex) => (
                  <li className="item-row" key={`${dayEntry.day_number}-${place}`}>
                    <span className="place-name">
                      <span className="place-number" aria-hidden="true">{placeIndex + 1}</span>
                      {place}
                    </span>
                    <span className="item-actions">
                      <button type="button" disabled={pending} aria-label={`Remove ${place}`} onClick={() => removePlace(place)}>Remove</button>
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        ))}
      </section>

      <div className="chat-drawer-toggle">
        <button type="button" className="btn btn-ghost" onClick={() => setDrawerOpen(open => !open)} aria-expanded={drawerOpen}>
          {drawerOpen ? 'Close chat ▾' : 'Anything else to change? ▴'}
        </button>
      </div>
      {drawerOpen && (
        <section className="chat-drawer" aria-label="Chat with Guide">
          <FreeTextComposer
            value={freeText}
            onChange={setFreeText}
            pending={pending}
            placeholder="Tell Guide what to change…"
            onSubmit={value => { setFreeText(''); sendChat(value); }}
          />
        </section>
      )}

      {/* TWM-174: Approve is the single, visually distinct commit action —
          deliberately its own row, not sharing space with the free-text
          refine drawer above (different-weight actions). */}
      <footer className="builder-footer">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={generate}>Approve this plan →</button>
      </footer>

      {!reopenChoicePending && (
        <p className="reversal-link">
          <button type="button" className="link-button" onClick={reopenDestinationDiscovery} disabled={pending}>
            Not the right destination? Let's explore other options →
          </button>
        </p>
      )}
    </main>
  );
}
