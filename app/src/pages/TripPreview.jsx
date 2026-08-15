import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import {
  buildRemovePlaceMessage, buildReplacePlaceMessage, buildSetPaceMessage, planBuilderSummary,
} from '../lib/guidePlanAdapter.js';
import { buildPlanRecapTurn } from '../lib/planChat.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import BackToTrip from '../components/BackToTrip.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import PaceMeter from '../components/ui/PaceMeter.jsx';
import '../styles/preview.css';

const PACE_OPTIONS = ['relaxed', 'balanced', 'packed'];
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
// TWM-174: kept as a single route rather than splitting Plan chat onto its
// own URL — the gating (!planReady) branch is restyled to read as its own
// distinct screen (no BackToTrip, its own refresh-recap variant, matching
// Discover's pattern), while the ready branch is Plan Builder proper. Both
// entry-path navigate() calls (ScoutChat.jsx:48, JourneyEntry.jsx:112,
// owned by the Discover & Destinations story) are unchanged by this
// decision — they still land here regardless of gating/ready state.
export default function TripPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { commandSnapshot, sendTripCommand, tripLoadStatus } = useTrip();

  const tripState = commandSnapshot?.trip_state;
  const tripContext = tripState?.trip_context;
  const plannerState = tripState?.planner_state;
  const frozenPlan = plannerState?.frozen_plan;
  const awaiting = plannerState?.conversation_context?.awaiting;
  const places = plannerState?.places || [];
  const dayPlan = plannerState?.day_plan || [];
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
  const [replacingPlace, setReplacingPlace] = useState(null);
  const [replacement, setReplacement] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState(null);
  const bootStarted = useRef(false);
  const trackedPlanBuilderView = useRef(false);
  const initializedRecap = useRef(false);
  // Best-effort distinction for planning_entry — a selected recommendation
  // means Discover led here; otherwise it's a known-destination entry.
  const planningEntry = tripContext?.selected_option ? 'discovered_destination' : 'known_destination';

  // Already frozen (e.g. the traveler navigated back after approving) — Guide
  // never reruns, so skip straight to the dashboard. TripDashboard.jsx owns
  // triggering the (also idempotent) Atlas itinerary generation from there.
  useEffect(() => {
    if (!frozenPlan) return;
    navigate('/dashboard', { replace: true });
  }, [frozenPlan, navigate]);

  // Bootstraps the real Guide session for the discover path (the
  // known-destination path already starts Guide from JourneyEntry's chat
  // before navigating here). Must wait for the Backend-authoritative trip
  // to finish loading first — commandSnapshot reads as empty on the very
  // first render, and firing start_planning against that transient empty
  // state would wrongly restart an already-in-progress Guide session.
  useEffect(() => {
    if (tripLoadStatus !== 'ready') return;
    if (frozenPlan || bootStarted.current) return;
    if (plannerState && (places.length || dayPlan.length || awaiting)) {
      setBootStatus('ready');
      return;
    }
    bootStarted.current = true;
    setBootStatus('booting');
    (async () => {
      try {
        const response = await sendTripCommand('start_planning');
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

  // TWM-174: Plan chat's refresh-recap — a refresh mid-gating-conversation
  // must not read as a blank slate. Only fires when there's no message
  // already in hand (a fresh navigation from ScoutChat/JourneyEntry already
  // carries one via location.state) and the plan isn't ready yet.
  useEffect(() => {
    if (initializedRecap.current || tripLoadStatus !== 'ready') return;
    initializedRecap.current = true;
    if (location.state?.guideMessage || planReady || message) return;
    const recap = buildPlanRecapTurn(tripContext, { awaiting });
    if (recap) setMessage(recap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus]);

  useEffect(() => {
    if (trackedPlanBuilderView.current || bootStatus !== 'ready' || !planReady) return;
    trackedPlanBuilderView.current = true;
    trackEvent('plan_builder_viewed', { planning_entry: planningEntry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootStatus, planReady]);

  async function sendEdit(text, editType) {
    setPending(true);
    setMessage('');
    try {
      const response = await sendTripCommand('traveler_message', { message: text });
      setMessage(response.message || '');
      if (editType) trackEvent('plan_builder_edit', { edit_type: editType, planning_entry: planningEntry });
    } catch (error) {
      // A 409 already refreshed commandSnapshot with the authoritative state;
      // surface that instead of the traveler's stale local intent.
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
      const nextState = response.trip?.trip_state;
      if (nextState?.active_agent === 'meridian' && nextState?.stage === 'matching') {
        navigate('/destinations');
        return;
      }
      setMessage(response.message || '');
    } catch (error) {
      setReversalError(error.message || 'Could not reconsider the destination.');
    } finally {
      setReversing(false);
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
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Planning could not start</strong>
          <span>{bootError}</span>
        </div>
      </main>
    );
  }

  if (bootStatus !== 'ready' || !plannerState) {
    return (
      <main className="wrap plan-builder">
        <BackToTrip />
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Guide is drafting your plan…</div>
      </main>
    );
  }

  // Guide is still gating on trip context (the five fixed facts, or the
  // sixth "anything else?" question) — no places/day_plan yet. This reads
  // as its own screen (Plan chat) per TWM-174, not embedded Plan Builder
  // filler: no BackToTrip here (matches Discover's entry-chat pattern of no
  // back-link until results exist, per the mockup).
  if (!planReady) {
    return (
      <main className="wrap plan-builder plan-chat">
        <span className="eyebrow">Guide</span>
        <h1>Let's shape <em>your plan</em></h1>
        <p className="lede">{message || (awaiting ? 'Guide needs a bit more before it can propose a plan.' : 'Setting up your plan…')}</p>
        {message && <div className="revision-message" role="status">{message}</div>}
        <div className="builder-controls" aria-label="Answer Guide">
          <FreeTextComposer
            value={freeText}
            onChange={setFreeText}
            pending={pending}
            placeholder="Your answer…"
            onSubmit={value => { setFreeText(''); sendEdit(value); }}
          />
        </div>
      </main>
    );
  }

  const summary = planBuilderSummary(tripContext, plannerState);

  return (
    <main className="wrap plan-builder">
      <BackToTrip />
      <span className="eyebrow">Guide Plan Builder</span>
      <h1>{summary.destinations.join(', ') || 'Your trip'} <em>| {summary.durationDays} days</em></h1>
      <p className="lede">Shape the places and day pace together. Dates can stay open until you book.</p>

      <section className="plan-summary" aria-label="Plan summary">
        <div><strong>{summary.destinations.length}</strong><span>destinations</span></div>
        <div><strong>{summary.placeCount}</strong><span>planned places</span></div>
        <div><strong>{summary.durationDays}</strong><span>days</span></div>
      </section>

      {message && <div className="revision-message" role="status">{message}</div>}
      {reversalError && <div className="price-evidence state-unsafe" role="alert">{reversalError}</div>}

      <section aria-label="Day plan">
        {dayPlan.map(dayEntry => (
          <article className="day-card" key={dayEntry.day_number}>
            <header className="day-card-head">
              <div className="day-card-title"><span className="daynum">{dayEntry.day_number}</span><div><h2>Day {dayEntry.day_number}</h2><PaceMeter pace={dayEntry.pace} /></div></div>
              <div className="pace-actions" role="group" aria-label={`Adjust Day ${dayEntry.day_number} pace`}>
                {PACE_OPTIONS.filter(pace => pace !== dayEntry.pace).map(pace => (
                  <button
                    type="button"
                    key={pace}
                    className="chip"
                    disabled={pending}
                    onClick={() => sendEdit(buildSetPaceMessage(dayEntry.day_number, pace), 'pace_adjust')}
                  >Make {pace}</button>
                ))}
              </div>
            </header>
            {dayEntry.buffer_note && <p className="buffer-note">{dayEntry.buffer_note}</p>}
            <ol className="plan-list">
              {dayEntry.places.map((place, placeIndex) => {
                const rowKey = `${dayEntry.day_number}-${place}`;
                return (
                <li className="item-row" key={rowKey}>
                  {replacingPlace === rowKey ? (
                    <span className="replace-row">
                      <span className="place-number" aria-hidden="true">{placeIndex + 1}</span>
                      <input
                        aria-label={`Replace ${place} with`}
                        value={replacement}
                        disabled={pending}
                        placeholder="Replacement place"
                        onChange={event => setReplacement(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' && replacement.trim()) {
                            sendEdit(buildReplacePlaceMessage(place, replacement.trim()), 'replace');
                            setReplacingPlace(null);
                            setReplacement('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={pending || !replacement.trim()}
                        onClick={() => {
                          sendEdit(buildReplacePlaceMessage(place, replacement.trim()), 'replace');
                          setReplacingPlace(null);
                          setReplacement('');
                        }}
                      >Confirm</button>
                      <button type="button" className="btn-ghost" disabled={pending} onClick={() => { setReplacingPlace(null); setReplacement(''); }}>Cancel</button>
                    </span>
                  ) : (
                    <>
                      <span className="place-name"><span className="place-number" aria-hidden="true">{placeIndex + 1}</span>{place}</span>
                      <span className="item-actions">
                        <button type="button" disabled={pending} aria-label={`Replace ${place}`} onClick={() => { setReplacingPlace(rowKey); setReplacement(''); }}>Replace</button>
                        <button type="button" disabled={pending} aria-label={`Remove ${place}`} onClick={() => sendEdit(buildRemovePlaceMessage(place), 'remove')}>Remove</button>
                      </span>
                    </>
                  )}
                </li>
                );
              })}
            </ol>
          </article>
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
            onSubmit={value => { setFreeText(''); sendEdit(value, 'chat'); }}
          />
        </section>
      )}

      {/* TWM-174: Approve is the single, visually distinct commit action —
          deliberately its own row, not sharing space with the free-text
          refine drawer above (different-weight actions). */}
      <footer className="builder-footer">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={generate}>Approve this plan →</button>
      </footer>

      <p className="reversal-link">
        <button type="button" className="link-button" onClick={reopenDestinationDiscovery} disabled={pending}>
          Not the right destination? Let's explore other options →
        </button>
      </p>
    </main>
  );
}
