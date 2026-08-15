import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import TripHero from '../components/TripHero.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import { getItinerary } from '../lib/tripApi.js';
import {
  anchorsForDay, bookingReadinessLabel, dayCostRange,
  verificationTone, trustStripCounts, bookingReadinessRollup,
} from '../lib/atlasView.js';
import { contextRecapPills, stageBadge, stageCta } from '../lib/tripLifecycle.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import '../styles/dashboard.css';

// TWM-175: 5 tabs, down from 7 — Map folds into Overview's day-strip (it
// was never a real map, just route order), Stays+Transport merge into the
// Bookings story that lands next (this story only adds an inert placeholder
// for that tab, not its real content).
const TABS = [
  { name: 'Overview', icon: '📊' },
  { name: 'Itinerary', icon: '📅' },
  { name: 'Bookings', icon: '🧳' },
  { name: 'Docs', icon: '📁' },
  { name: 'Support', icon: '💬' },
];

const BOOKING_PROMPT_SHOWN_KEY = uiStateKey(UI_STATE_SCREEN.DASHBOARD_OVERVIEW, 'bookingPromptShown');

// Calibrated to the real possible wait (n8n's 180s workflow timeout / FastAPI's
// 185s deadline) — never implies near-instant completion. The first two
// steps optimistically advance over ~40s; the last holds honestly (per
// HonestTransition's own guarantee) for however much longer the real
// generation actually takes.
const ARRIVAL_STEPS = ['Reviewing your approved plan', 'Building your day-by-day itinerary', 'Checking practical details'];
const ARRIVAL_STEP_DURATION_MS = 20000;

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const moneyRange = (low, high) => (low == null || high == null ? null : `${money(low)}–${money(high)}`);
// Atlas categories arrive as raw snake_case (e.g. "arrival_departure_window") — humanize for display.
const humanize = value => value.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

function BudgetBar({ low, high, min, max }) {
  const span = Math.max(max - min, 1);
  const left = ((low - min) / span) * 100;
  const width = Math.max(((high - low) / span) * 100, 3);
  return <div className="budget-track"><div className="budget-fill" style={{ left: `${left}%`, width: `${width}%` }} /></div>;
}

const READINESS_TONE = { suggested: 'positive', needs_advance_booking: 'caution', unresolved: 'negative' };

// Filled shape — deliberately distinct from VerificationTag's outline shape
// so a timeline item carrying both axes (verified/guidance + booking
// readiness) reads as two different kinds of status at a glance, not just
// two different colors.
function BookingReadinessBadge({ status }) {
  if (!status) return null;
  return <StatusPill tone={READINESS_TONE[status] || 'neutral'}>{bookingReadinessLabel(status)}</StatusPill>;
}

// Outline shape — AtlasReference.status (VERIFIED/GENERAL_GUIDANCE) was
// completely invisible in the UI before this story despite being central to
// Atlas's evidence/trust design (the single biggest capability-to-UI
// mismatch the agent-capability audit found).
function VerificationTag({ status }) {
  if (!status) return null;
  const label = status === 'VERIFIED' ? 'Verified' : 'General guidance';
  return <StatusPill tone={verificationTone(status)} variant="outline">{label}</StatusPill>;
}

function AnchorList({ anchors }) {
  if (!anchors.length) return null;
  return (
    <div className="anchor-list" aria-label="Confirmed">
      {anchors.map(anchor => (
        <article className="dashboard-card anchor-card" key={anchor.id}>
          <div>
            <span className="badge badge-confirmed">🔒 confirmed</span>
            <h3>{anchor.label}</h3>
            <p>{anchor.detail}</p>
            {anchor.reference && <div className="confirmation-chip">✓ {anchor.reference}</div>}
            {anchor.notes && <p className="anchor-notes">{anchor.notes}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}

// TWM-175: Dashboard is reachable from message one, not gated behind
// itinerary-ready — a thin recap + status + CTA into whichever Build screen
// is relevant, filling in as the trip matures. Never attempts to boot Atlas
// before a plan is actually frozen (the Backend rejects start_itinerary
// otherwise), which is what used to surface as a raw error on an early visit.
function ThinStateDashboard({ tripState }) {
  const navigate = useNavigate();
  const badge = stageBadge(tripState);
  const cta = stageCta(tripState);
  const pills = contextRecapPills(tripState?.trip_context);
  return (
    <main className="wrap dashboard">
      <div className="thin-state-card">
        <StatusPill tone="neutral">{badge.text}</StatusPill>
        <h1 className="hero-title">Your <em>trip</em></h1>
        {pills.length > 0 ? (
          <div className="trip-recap">{pills.map(p => <span key={p} className="recap-pill">{p}</span>)}</div>
        ) : (
          <p className="thin-state-empty">Nothing saved yet — this fills in as you go.</p>
        )}
        <p className="thin-state-note">Your itinerary will appear here once your plan is approved.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate(cta.to)}>{cta.label}</button>
      </div>
    </main>
  );
}

// TWM-175: the diff-explanation + equal-weight-actions pattern, reused from
// the Discover story's checkpoint (amber-toned here since this is a
// confirmation gate, not an information gap).
function RevisionOverlay({ proposedRevision, pending, error, onKeep, onAccept }) {
  const dayLabel = proposedRevision.affected_days.length > 1
    ? `Days ${proposedRevision.affected_days.join(' and ')}`
    : `Day ${proposedRevision.affected_days[0]}`;
  return (
    <section className="revision-review" aria-label="Proposed itinerary revision">
      <strong>⚠️ This affects {dayLabel}</strong>
      <ul>{proposedRevision.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
      {error && <p className="revision-error" role="alert">{error}</p>}
      <div className="revision-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onKeep}>Keep current itinerary</button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onAccept}>Accept the changes</button>
      </div>
    </section>
  );
}

// TWM-175: shown exactly once, the first time this trip's itinerary is
// generated — not on every subsequent visit (persisted via ui_state).
function BookingPromptOverlay({ onResolveBookings, onLookAround }) {
  return (
    <div className="checkpoint-overlay" role="dialog" aria-modal="true" aria-label="Your itinerary is ready">
      <div className="checkpoint-card">
        <span className="eyebrow">Itinerary ready</span>
        <p className="checkpoint-message">Your itinerary's ready — sort out bookings now, or take a look at the trip first?</p>
        <div className="booking-prompt-actions">
          <button type="button" className="btn btn-ghost" onClick={onLookAround}>Take a look at the trip first</button>
          <button type="button" className="btn btn-primary" onClick={onResolveBookings}>Sort out bookings now</button>
        </div>
      </div>
    </div>
  );
}

function DayStrip({ days, activeDayNumber, onSelectDay }) {
  return (
    <nav className="day-strip" aria-label="Trip days">
      {days.map(day => (
        <button
          type="button"
          key={day.day_number}
          className={`day-strip-pill${day.day_number === activeDayNumber ? ' active' : ''}`}
          onClick={() => onSelectDay(day.day_number)}
        >
          <span className="day-strip-num">{day.day_number}</span>
          <span className="day-strip-location">{day.primary_location}</span>
        </button>
      ))}
    </nav>
  );
}

function TrustStrip({ counts }) {
  const ratioLabel = counts.verifiedCount + counts.generalGuidanceCount === 0
    ? 'No sourced details yet'
    : `${counts.verifiedCount} verified · ${counts.generalGuidanceCount} general guidance`;
  return (
    <div className="trust-strip" aria-label="Trip trust summary">
      <div className="trust-strip-item"><strong>{counts.assumptionsCount}</strong><span>Assumptions made</span></div>
      <div className="trust-strip-item"><strong>{counts.unresolvedCount}</strong><span>Open items</span></div>
      <div className="trust-strip-item"><strong className="trust-strip-ratio">{ratioLabel}</strong><span>Evidence basis</span></div>
    </div>
  );
}

export default function TripDashboard() {
  const { commandSnapshot, sendTripCommand, tripLoadStatus, uiState, updateUiState } = useTrip();
  const [params] = useSearchParams();
  const initialTab = TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Overview';
  const [tab, setTab] = useState(initialTab);
  const [activeDay, setActiveDay] = useState(null);

  const tripState = commandSnapshot?.trip_state;
  const plannerState = tripState?.planner_state;
  const frozenPlan = plannerState?.frozen_plan;
  const itineraryState = tripState?.itinerary_state;
  const anchors = tripState?.logistics_state?.anchors ?? [];
  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const [showBookingPrompt, setShowBookingPrompt] = useState(false);
  const bootStarted = useRef(false);

  // The active itinerary's full result is fetched lazily (TWM-159/160) — it
  // no longer arrives inline on commandSnapshot. This is a separate signal
  // from bootStatus/itineraryState?.status on purpose: the boot guard above
  // must decide whether to (re-)invoke start_itinerary from commandSnapshot
  // alone, never from whether this fetch has resolved, or a slow fetch could
  // race the guard into wrongly re-firing start_itinerary against transient
  // empty state.
  const [itineraryStatus, setItineraryStatus] = useState('idle'); // idle | loading | ready | error
  const [itineraryResult, setItineraryResult] = useState(null);
  const [itineraryFetchError, setItineraryFetchError] = useState(null);
  // Tracks which trip the current/last fetch belongs to, not just whether
  // one has started — otherwise switching trips without unmounting (e.g. a
  // future in-app trip switcher) would keep itineraryFetchStarted.current
  // stuck true from the previous trip, skip refetching, and render the
  // previous trip's itinerary under the new one.
  const [itineraryTripId, setItineraryTripId] = useState(null);
  const itineraryFetchStarted = useRef(null); // tripId currently/last fetched, or null

  const [revisionPending, setRevisionPending] = useState(false);
  const [revisionError, setRevisionError] = useState(null);

  const tripId = commandSnapshot?.id;

  const trackedThinState = useRef(false);
  useEffect(() => {
    if (trackedThinState.current || tripLoadStatus !== 'ready' || frozenPlan) return;
    trackedThinState.current = true;
    trackEvent('dashboard_thin_state_viewed', { stage: tripState?.stage ?? 'new' });
  }, [tripLoadStatus, frozenPlan, tripState?.stage]);

  // Reopen never re-invokes Atlas: once ready, render the saved result and
  // never call start_itinerary again for this trip. Must wait for the trip
  // to finish loading and a plan to actually be frozen — calling
  // start_itinerary before that is a real Backend rejection (the approved
  // plan is the prerequisite), not just an empty state.
  useEffect(() => {
    if (tripLoadStatus !== 'ready' || !frozenPlan) return;
    if (itineraryState?.status === 'ready') {
      setBootStatus('ready');
      return;
    }
    if (bootStarted.current) return;
    bootStarted.current = true;
    setBootStatus('booting');
    sendTripCommand('start_itinerary')
      .then(response => {
        // A touched-branches command response (TWM-154) includes itinerary_state
        // only when this call actually generated it — apply_atlas's idempotent
        // no-op path (already ready backend-side) leaves it untouched, so this
        // distinguishes a real generation from a harmless re-request.
        if (response.trip?.trip_state?.itinerary_state) {
          trackEvent('itinerary_generated', { generation_type: 'atlas' });
          if (!uiState[BOOKING_PROMPT_SHOWN_KEY]) {
            setShowBookingPrompt(true);
            trackEvent('booking_prompt_shown', {});
            updateUiState({ [BOOKING_PROMPT_SHOWN_KEY]: true }).catch(() => {});
          }
        }
        setBootStatus('ready');
      })
      .catch(error => {
        trackFailure('itinerary_generation', error);
        setBootStatus('error');
        setBootError(error.message || 'Could not generate the detailed itinerary.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, frozenPlan, itineraryState?.status, sendTripCommand]);

  // Fetches the itinerary body only once the boot guard above has confirmed
  // (via commandSnapshot, not this fetch) that a ready itinerary exists
  // backend-side. itineraryFetchStarted mirrors bootStarted's guard so this
  // fires exactly once per Dashboard visit.
  useEffect(() => {
    if (bootStatus !== 'ready' || itineraryState?.status !== 'ready' || !tripId) return;
    if (itineraryFetchStarted.current === tripId) return;
    itineraryFetchStarted.current = tripId;
    setItineraryStatus('loading');
    getItinerary(tripId)
      .then(record => {
        setItineraryResult(record);
        setItineraryTripId(tripId);
        setItineraryStatus('ready');
      })
      .catch(error => {
        setItineraryStatus('error');
        setItineraryFetchError(error.message || 'Could not load the detailed itinerary.');
      });
  }, [bootStatus, itineraryState?.status, tripId]);

  const trackedDashboardEntry = useRef(false);
  useEffect(() => {
    if (trackedDashboardEntry.current || itineraryStatus !== 'ready') return;
    trackedDashboardEntry.current = true;
    trackEvent('itinerary_viewed', { view_source: 'dashboard' });
    trackEvent('dashboard_entered', { entry_source: 'itinerary' });
  }, [itineraryStatus]);

  async function resolveRevision(command) {
    setRevisionPending(true);
    setRevisionError(null);
    try {
      await sendTripCommand(command);
      trackEvent(command === 'accept_itinerary_revision' ? 'itinerary_revision_accepted' : 'itinerary_revision_kept', {});
    } catch (error) {
      setRevisionError(error.message || 'Could not update the itinerary.');
    } finally {
      setRevisionPending(false);
    }
  }

  function resolveBookingPrompt(destination) {
    trackEvent('booking_prompt_choice', { choice: destination });
    setShowBookingPrompt(false);
    if (destination === 'bookings') setTab('Bookings');
  }

  // TWM-175: reachable from message one — never attempts to boot Atlas
  // before a plan is frozen, so an early visit shows a real recap + CTA
  // instead of a crash or a blank page.
  if (tripLoadStatus === 'ready' && !frozenPlan) {
    return <ThinStateDashboard tripState={tripState} />;
  }

  if (bootStatus === 'error') {
    return (
      <main className="wrap dashboard">
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Itinerary unavailable</strong>
          <span>{bootError}</span>
        </div>
      </main>
    );
  }

  if (itineraryStatus === 'error') {
    return (
      <main className="wrap dashboard">
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Itinerary unavailable</strong>
          <span>{itineraryFetchError}</span>
        </div>
      </main>
    );
  }

  if (bootStatus === 'booting' && itineraryState?.status !== 'ready') {
    return (
      <main className="wrap dashboard">
        <HonestTransition steps={ARRIVAL_STEPS} label="Building your itinerary" stepDurationMs={ARRIVAL_STEP_DURATION_MS} />
      </main>
    );
  }

  if (bootStatus !== 'ready' || itineraryState?.status !== 'ready' || itineraryStatus !== 'ready' || itineraryTripId !== tripId) {
    return (
      <main className="wrap dashboard">
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading your trip…</div>
      </main>
    );
  }

  const result = itineraryResult.result;
  const finalItinerary = result.final_itinerary;
  const days = finalItinerary.days;
  const selectedDay = days.find(day => day.day_number === activeDay) || days[0];
  const selectedDayCost = dayCostRange(selectedDay);
  const allCosts = days.flatMap(day => { const range = dayCostRange(day); return [range.low, range.high]; });
  const costMin = Math.min(...allCosts, 0);
  const costMax = Math.max(...allCosts, 1);
  const proposedRevision = itineraryState.proposed_revision;
  const trustCounts = trustStripCounts(finalItinerary, result);
  const readiness = bookingReadinessRollup(days, anchors);

  return (
    <main className="wrap dashboard">
      {showBookingPrompt && (
        <BookingPromptOverlay
          onResolveBookings={() => resolveBookingPrompt('bookings')}
          onLookAround={() => resolveBookingPrompt('overview')}
        />
      )}
      <TripHero
        finalItinerary={finalItinerary}
        actions={<>
          <button className="btn btn-ghost" type="button" onClick={() => alert('PDF generation is not available yet.')}>📄 PDF</button>
          <button className="btn btn-ghost" type="button" onClick={() => alert('Sharing is not available yet.')}>🔗 Share</button>
        </>}
      />

      {proposedRevision && (
        <RevisionOverlay
          proposedRevision={proposedRevision}
          pending={revisionPending}
          error={revisionError}
          onKeep={() => resolveRevision('keep_current_itinerary')}
          onAccept={() => resolveRevision('accept_itinerary_revision')}
        />
      )}

      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">{TABS.map(({ name, icon }) => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}><span className="tab-icon">{icon}</span> {name}</button>)}</nav>

      {tab === 'Overview' && <section aria-label="Trip overview">
        <DayStrip
          days={days}
          activeDayNumber={selectedDay.day_number}
          onSelectDay={dayNumber => { setActiveDay(dayNumber); setTab('Itinerary'); }}
        />
        {finalItinerary.trip_summary.route_rationale && (
          <div className="route-rationale"><span className="hero-why-label">Why this route</span><p>{finalItinerary.trip_summary.route_rationale}</p></div>
        )}

        <TrustStrip counts={trustCounts} />

        <div className="tab-intro"><div><h2>💰 Estimated budget</h2><p>{finalItinerary.budget_summary.budget_fit}</p></div></div>
        <BudgetBar low={finalItinerary.budget_summary.total_low} high={finalItinerary.budget_summary.total_high} min={0} max={Math.max(finalItinerary.budget_summary.total_high, 1)} />
        <div className="budget-summary-card">
          {finalItinerary.budget_summary.lines.map((line, index) => <div className="budget-summary-row" key={index}><span>{line.category}</span><strong>{moneyRange(line.amount_low, line.amount_high)}</strong><p>{line.note}</p></div>)}
          <div className="budget-summary-row total"><span>Estimated total</span><strong>{moneyRange(finalItinerary.budget_summary.total_low, finalItinerary.budget_summary.total_high)}</strong></div>
        </div>

        <div className="readiness-row">
          <span>{readiness.ready} of {readiness.total} bookable items ready</span>
          {readiness.total > readiness.ready && (
            <button type="button" className="btn btn-ghost" onClick={() => setTab('Bookings')}>Resolve bookings →</button>
          )}
        </div>

        <div className="sources-list">
          <h3>Sources</h3>
          {finalItinerary.sources.length > 0
            ? <ul>{finalItinerary.sources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul>
            : <p className="honest-empty">No external sources cited.</p>}
        </div>

        {(finalItinerary.assumptions.length > 0 || result.unresolved.length > 0 || finalItinerary.practical_notes.length > 0) && (
          <details className="trip-notes-disclosure">
            <summary>Trip notes — assumptions, open items, and good-to-knows</summary>

            {result.unresolved.length > 0 && (
              <>
                <div className="tab-intro"><div><h2>❓ Unresolved</h2><p>Worth checking closer to your travel dates.</p></div></div>
                <div className="insight-grid">
                  {result.unresolved.map((item, index) => (
                    <div className="insight-card insight-card-unresolved" key={index}>
                      <span className="insight-badge insight-badge-unresolved">{item.item}</span>
                      <p>{item.generic_guidance}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(finalItinerary.assumptions.length > 0 || finalItinerary.practical_notes.length > 0) && (
              <ul className="trip-notes-list">
                {finalItinerary.assumptions.map((item, index) => (
                  <li key={`a${index}`}><strong>{humanize(item.category)}</strong> — {item.detail}</li>
                ))}
                {finalItinerary.practical_notes.map((note, index) => (
                  <li key={`p${index}`}><strong>{note.title}</strong> — {note.detail} <VerificationTag status={note.reference?.status} /></li>
                ))}
              </ul>
            )}
          </details>
        )}
      </section>}

      {tab === 'Docs' && <section aria-label="Trip documents">
        <div className="tab-intro"><div><h2>📁 Documents</h2><p>Flight tickets, hotel confirmations, and other trip documents.</p></div></div>
        <div className="docs-placeholder">
          <span className="docs-placeholder-icon">📁</span>
          <strong>Coming soon</strong>
          <p>Upload and keep track of your trip documents here.</p>
        </div>
      </section>}

      {tab === 'Itinerary' && selectedDay && <section aria-label="Detailed days" className="dashboard-days-wrap">
        <nav className="dashboard-day-nav" aria-label="Select a day">
          {days.map(day => <button type="button" key={day.day_number} className={`dashboard-day-pill${day.day_number === selectedDay.day_number ? ' active' : ''}`} aria-current={day.day_number === selectedDay.day_number ? 'page' : undefined} onClick={() => setActiveDay(day.day_number)}>
            <span className="pill-num">{day.day_number}</span>
            <span className="pill-text"><span className="label">Day {day.day_number}</span><span className="base">{day.primary_location}</span></span>
          </button>)}
        </nav>
        <div className="dashboard-days-main">
          <article className="atlas-day compact">
            <header>
              <span className="atlas-day-eyebrow">Day {String(selectedDay.day_number).padStart(2, '0')} · {days.length} days total</span>
              <h2>{selectedDay.title}</h2>
              <p className="atlas-day-route">📍 {selectedDay.primary_location}</p>
              <p>{selectedDay.summary}</p>
            </header>
            <AnchorList anchors={anchorsForDay(anchors, selectedDay.day_number)} />
            <div className="atlas-timeline">
              {selectedDay.timeline.map((item, index) => <div className="atlas-item" key={index}>
                <span className="atlas-dot">{item.kind === 'TRAVEL' ? '🚗' : item.kind === 'STAY' ? '🏨' : item.kind === 'MEAL' ? '🍽️' : item.kind === 'FREE_TIME' ? '🕒' : '📍'}</span>
                <div>
                  <time>{item.start_time || 'Flexible'}{item.end_time ? ` – ${item.end_time}` : ''}</time>
                  <div className="item-summary-row">
                    <strong>{item.title}</strong>
                    {moneyRange(item.estimated_cost_low, item.estimated_cost_high) && <span className="item-cost">{moneyRange(item.estimated_cost_low, item.estimated_cost_high)}</span>}
                    <VerificationTag status={item.reference?.status} />
                    <BookingReadinessBadge status={item.booking_readiness} />
                  </div>
                  <p>{item.detail}</p>
                  {item.movement_guidance && <p className="movement-guidance">{item.movement_guidance}</p>}
                </div>
              </div>)}
            </div>
            <div className="atlas-day-footer">
              <div className="footer-budget">
                <span className="footer-label">💰 Estimated for this day</span>
                <strong>{moneyRange(selectedDayCost.low, selectedDayCost.high) || 'Not estimated'}</strong>
                <BudgetBar low={selectedDayCost.low} high={selectedDayCost.high} min={costMin} max={costMax} />
              </div>
              <div className="footer-tips">
                <span className="footer-label">🎒 Good to know</span>
                <ul className="tips-list">
                  <li><span>🌦️</span>{selectedDay.seasonal_guidance}</li>
                  <li><span>🎫</span>{selectedDay.permit_or_ticket_guidance}</li>
                  {selectedDay.backup_plan && <li><span>🔁</span>{selectedDay.backup_plan}</li>}
                </ul>
              </div>
            </div>
          </article>
        </div>
      </section>}

      {tab === 'Bookings' && <section aria-label="Bookings">
        <div className="tab-intro"><div><h2>🧳 Bookings</h2><p>Content arrives in the next story.</p></div></div>
        <div className="docs-placeholder" aria-label="Bookings placeholder">
          <span className="docs-placeholder-icon">🧳</span>
          <strong>Coming soon</strong>
          <p>Confirmed stays, transport, and activities will live here.</p>
        </div>
      </section>}

      {tab === 'Support' && <section>
        <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with this specific itinerary.</p></div></div>
        <section className="support-box">
          <span className="support-label">Questions or changes to this itinerary?</span>
          <p>This is specifically for support on the plan you've already received — swapping something, adjusting dates, or anything unclear. For actually booking the trip, use the option below instead.</p>
          <button type="button" className="btn btn-primary" onClick={() => alert('This would open a conversation with the TravelWithMe team.')}>Talk to the TravelWithMe team</button>
        </section>
        <section className="booking-help-box">
          <div><h3>Want us to help book this trip?</h3><p>Our team can handle flights, stays, and every reservation end-to-end, so you don't have to.</p></div>
          <button type="button" className="btn btn-amber" onClick={() => { trackEvent('booking_intent', { booking_type: 'concierge_request' }); alert('This would start a TravelWithMe-led booking request.'); }}>Get booking help →</button>
        </section>
      </section>}
    </main>
  );
}
