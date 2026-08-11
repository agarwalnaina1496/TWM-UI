import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import {
  buildAddPlaceMessage, buildRemovePlaceMessage, buildSetPaceMessage, buildSetStartDateMessage,
  planBuilderSummary, UNDO_MESSAGE,
} from '../lib/guidePlanAdapter.js';
import '../styles/preview.css';

export default function TripPreview() {
  const navigate = useNavigate();
  const { commandSnapshot, sendTripCommand } = useTrip();

  const tripState = commandSnapshot?.trip_state;
  const plannerState = tripState?.planner_state;
  const frozenPlan = plannerState?.frozen_plan;
  const session = plannerState?.guide_session;
  const guideState = session?.state;

  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [newPlaceByDay, setNewPlaceByDay] = useState({});
  const [freeText, setFreeText] = useState('');
  const bootStarted = useRef(false);

  // Already frozen (e.g. the traveler navigated back after approving) — Guide
  // never reruns, so skip straight to the dashboard. TripDashboard.jsx owns
  // triggering the (also idempotent) Atlas itinerary generation from there.
  useEffect(() => {
    if (!frozenPlan) return;
    navigate('/dashboard', { replace: true });
  }, [frozenPlan, navigate]);

  // Bootstraps the real Guide session: START, then a silent APPROVE_PLACES so
  // the single-screen Plan Builder has a day plan to show immediately — the
  // traveler never sees the Backend's two-phase places/day approval split.
  useEffect(() => {
    if (frozenPlan || bootStarted.current) return;
    if (guideState?.phase === 'DAY_PLAN_DRAFT' || guideState?.phase === 'NEEDS_CLARIFICATION') {
      setBootStatus('ready');
      return;
    }
    bootStarted.current = true;
    setBootStatus('booting');
    (async () => {
      try {
        let state = guideState;
        if (!state) {
          const response = await sendTripCommand('start_planning');
          state = response.trip.trip_state.planner_state.guide_session.state;
        }
        if (state.phase === 'PLACES_DRAFT') await sendTripCommand('approve_places');
        setBootStatus('ready');
      } catch (error) {
        setBootStatus('error');
        setBootError(error.message || 'Could not start planning.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenPlan, guideState?.phase]);

  async function sendEdit(text) {
    setPending(true);
    setMessage('');
    try {
      const response = await sendTripCommand('traveler_message', { message: text });
      setMessage(response.message || '');
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
    sendTripCommand('approve_plan')
      .catch(error => setMessage(error.message || 'Could not generate the detailed itinerary.'))
      .finally(() => setPending(false));
    // Freezing navigates via the frozenPlan effect above once commandSnapshot updates.
  }

  if (bootStatus === 'error') {
    return (
      <main className="wrap plan-builder">
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Planning could not start</strong>
          <span>{bootError}</span>
        </div>
      </main>
    );
  }

  if (bootStatus !== 'ready' || !guideState) {
    return (
      <main className="wrap plan-builder">
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Guide is drafting your plan…</div>
      </main>
    );
  }

  const summary = planBuilderSummary(guideState);
  const dayPlan = guideState.day_plan || [];

  return (
    <main className="wrap plan-builder">
      <Link className="back-link" to="/destinations">← Back to destinations</Link>
      <span className="eyebrow">Guide Plan Builder</span>
      <h1>{summary.destinations.join(', ') || 'Your trip'} <em>| {summary.durationDays} days</em></h1>
      <p className="lede">Shape the places and broad days together. Dates can stay open until you book.</p>

      <section className="plan-summary" aria-label="Plan summary">
        <div><strong>{summary.destinations.length}</strong><span>destinations</span></div>
        <div><strong>{summary.placeCount}</strong><span>planned places</span></div>
        <div><strong>{summary.durationDays}</strong><span>days</span></div>
      </section>

      <section className="builder-controls" aria-label="Trip timing">
        <label>Optional start date<input type="date" defaultValue={guideState.start_date || ''} disabled={pending} onBlur={event => sendEdit(buildSetStartDateMessage(event.target.value))} /></label>
        <div className="date-mode">{guideState.start_date ? guideState.start_date : `Duration-only · Day 1–${summary.durationDays}`}</div>
        <label>Pace<input type="text" defaultValue={guideState.preferences?.join(', ') || ''} disabled={pending} onBlur={event => event.target.value && sendEdit(buildSetPaceMessage(event.target.value))} /></label>
      </section>

      {guideState.phase === 'NEEDS_CLARIFICATION' && guideState.pending_clarification && (
        <div className="revision-message" role="status">Guide needs to know: {guideState.pending_clarification}</div>
      )}
      {message && <div className="revision-message" role="status">{message}</div>}

      <section aria-label="Day plan">
        {dayPlan.map(dayEntry => (
          <article className="day-card" key={dayEntry.day_number}>
            <header className="day-card-head">
              <div className="day-card-title"><span className="daynum">{dayEntry.day_number}</span><div><h2>Day {dayEntry.day_number}</h2></div></div>
            </header>
            <ul className="plan-list">
              {dayEntry.places.map(place => (
                <li className="item-row" key={`${dayEntry.day_number}-${place}`}>
                  <span>{place}</span>
                  <span className="item-actions">
                    <button type="button" disabled={pending} aria-label={`Remove ${place}`} onClick={() => sendEdit(buildRemovePlaceMessage(dayEntry.day_number, place))}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="add-place-row">
              <input
                aria-label={`Add place to Day ${dayEntry.day_number}`}
                value={newPlaceByDay[dayEntry.day_number] || ''}
                placeholder="Add a place or broad activity"
                disabled={pending}
                onChange={event => setNewPlaceByDay(previous => ({ ...previous, [dayEntry.day_number]: event.target.value }))}
              />
              <button
                type="button"
                disabled={pending || !newPlaceByDay[dayEntry.day_number]?.trim()}
                onClick={() => {
                  const value = newPlaceByDay[dayEntry.day_number]?.trim();
                  if (!value) return;
                  sendEdit(buildAddPlaceMessage(dayEntry.day_number, value));
                  setNewPlaceByDay(previous => ({ ...previous, [dayEntry.day_number]: '' }));
                }}
              >Add</button>
            </div>
          </article>
        ))}
      </section>

      <section className="builder-controls" aria-label="Anything else">
        <label>Anything else to change?
          <input type="text" value={freeText} disabled={pending} placeholder="Tell Guide what to change…" onChange={event => setFreeText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && freeText.trim()) { sendEdit(freeText.trim()); setFreeText(''); } }} />
        </label>
      </section>

      <footer className="builder-footer">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => sendEdit(UNDO_MESSAGE)}>Undo last change</button>
        <button type="button" className="btn btn-primary" disabled={pending || guideState.phase !== 'DAY_PLAN_DRAFT'} onClick={generate}>Generate detailed itinerary →</button>
      </footer>
    </main>
  );
}
