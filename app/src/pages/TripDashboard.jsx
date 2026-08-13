import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import TripHero from '../components/TripHero.jsx';
import { getItineraryVersions } from '../lib/tripApi.js';
import { anchorsByType, anchorsForDay, bookingReadinessLabel, dayCostRange, routeLocations, timelineIcon } from '../lib/atlasView.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import '../styles/dashboard.css';

const TABS = [
  { name: 'Days', icon: '📅' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Stays', icon: '🏨' },
  { name: 'Map', icon: '🗺️' },
  { name: 'Budget breakdown', icon: '💰' },
  { name: 'Support', icon: '💬' },
];

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const moneyRange = (low, high) => (low == null || high == null ? null : `${money(low)}–${money(high)}`);

const EMPTY_CONFIRM_FIELDS = { label: '', detail: '', dayNumber: '', reference: '', notes: '' };

function BudgetBar({ low, high, min, max }) {
  const span = Math.max(max - min, 1);
  const left = ((low - min) / span) * 100;
  const width = Math.max(((high - low) / span) * 100, 3);
  return <div className="budget-track"><div className="budget-fill" style={{ left: `${left}%`, width: `${width}%` }} /></div>;
}

function BookingReadinessBadge({ status }) {
  if (!status) return null;
  return <span className={`badge badge-readiness-${status}`}>{bookingReadinessLabel(status)}</span>;
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

function ConfirmationForm({ dayOptions, fields, setFields, onSubmit, onCancel, pending, error }) {
  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <label>What's confirmed?
        <input required value={fields.label} disabled={pending} placeholder="e.g. Delhi to Rishikesh train" onChange={event => setFields(previous => ({ ...previous, label: event.target.value }))} />
      </label>
      <label>Details
        <textarea required value={fields.detail} disabled={pending} placeholder="e.g. Confirmed arrival at 2:00 PM via train 12050" onChange={event => setFields(previous => ({ ...previous, detail: event.target.value }))} />
      </label>
      <label>Day
        <select value={fields.dayNumber} disabled={pending} onChange={event => setFields(previous => ({ ...previous, dayNumber: event.target.value }))}>
          <option value="">Not day-specific</option>
          {dayOptions.map(day => <option key={day} value={day}>Day {day}</option>)}
        </select>
      </label>
      <label>Confirmation code (optional)
        <input value={fields.reference} disabled={pending} onChange={event => setFields(previous => ({ ...previous, reference: event.target.value }))} />
      </label>
      <label>Notes (optional)
        <input value={fields.notes} disabled={pending} onChange={event => setFields(previous => ({ ...previous, notes: event.target.value }))} />
      </label>
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending || !fields.label.trim() || !fields.detail.trim()}>Save confirmation</button>
      </div>
    </form>
  );
}

export default function TripDashboard() {
  const { commandSnapshot, sendTripCommand, tripLoadStatus } = useTrip();
  const [params] = useSearchParams();
  const initialTab = TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Days';
  const [tab, setTab] = useState(initialTab);
  const [activeDay, setActiveDay] = useState(null);

  const itineraryState = commandSnapshot?.trip_state?.itinerary_state;
  const anchors = commandSnapshot?.trip_state?.logistics_state?.anchors ?? [];
  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const bootStarted = useRef(false);

  const [confirmType, setConfirmType] = useState(null); // 'transport' | 'stay' | 'activity' | null
  const [confirmFields, setConfirmFields] = useState(EMPTY_CONFIRM_FIELDS);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  const [revisionPending, setRevisionPending] = useState(false);
  const [revisionError, setRevisionError] = useState(null);

  // Accepted-revision history is fetched lazily (TWM-155) — it no longer
  // rides along on trip_state, since only this "Prior versions" list needs it.
  const tripId = commandSnapshot?.id;
  const [priorVersions, setPriorVersions] = useState([]);
  const refreshPriorVersions = useCallback(async (idOverride) => {
    const id = idOverride ?? tripId;
    if (!id) return;
    try {
      setPriorVersions(await getItineraryVersions(id));
    } catch {
      // Non-critical: the active itinerary still renders without this list.
    }
  }, [tripId]);

  // Reopen never re-invokes Atlas: once ready, render the saved result and
  // never call start_itinerary again for this trip. Must wait for the trip
  // to finish loading — itineraryState reads as empty on the very first
  // render (no client-side cache backs it anymore), and firing
  // start_itinerary against that transient empty state would wrongly
  // restart an already-ready itinerary.
  useEffect(() => {
    if (tripLoadStatus !== 'ready') return;
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
        }
        setBootStatus('ready');
      })
      .catch(error => {
        trackFailure('itinerary_generation', error);
        setBootStatus('error');
        setBootError(error.message || 'Could not generate the detailed itinerary.');
      });
  }, [tripLoadStatus, itineraryState?.status, sendTripCommand]);

  const trackedDashboardEntry = useRef(false);
  useEffect(() => {
    if (trackedDashboardEntry.current || bootStatus !== 'ready' || itineraryState?.status !== 'ready') return;
    trackedDashboardEntry.current = true;
    trackEvent('itinerary_viewed', { view_source: 'dashboard' });
    trackEvent('dashboard_entered', { entry_source: 'itinerary' });
  }, [bootStatus, itineraryState?.status]);

  useEffect(() => {
    if (bootStatus !== 'ready') return;
    refreshPriorVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootStatus, tripId]);

  function openConfirmForm(type, dayNumber) {
    setConfirmType(type);
    setConfirmFields({ ...EMPTY_CONFIRM_FIELDS, dayNumber: dayNumber ? String(dayNumber) : '' });
    setConfirmError(null);
  }

  async function submitConfirmForm(event) {
    event.preventDefault();
    setConfirmPending(true);
    setConfirmError(null);
    try {
      await sendTripCommand('confirm_logistics', {
        logisticsConfirmation: {
          type: confirmType,
          label: confirmFields.label.trim(),
          detail: confirmFields.detail.trim(),
          day_number: confirmFields.dayNumber ? Number(confirmFields.dayNumber) : null,
          reference: confirmFields.reference.trim() || null,
          notes: confirmFields.notes.trim() || null,
        },
      });
      setConfirmType(null);
    } catch (error) {
      setConfirmError(error.message || 'Could not save that confirmation.');
    } finally {
      setConfirmPending(false);
    }
  }

  async function resolveRevision(command) {
    setRevisionPending(true);
    setRevisionError(null);
    try {
      const response = await sendTripCommand(command);
      // accept_itinerary_revision archives the outgoing version (TWM-155);
      // keep_current_itinerary archives nothing, so this is a harmless no-op.
      if (command === 'accept_itinerary_revision') await refreshPriorVersions(response.trip?.id);
    } catch (error) {
      setRevisionError(error.message || 'Could not update the itinerary.');
    } finally {
      setRevisionPending(false);
    }
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

  if (bootStatus !== 'ready' || itineraryState?.status !== 'ready') {
    return (
      <main className="wrap dashboard">
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Building your detailed itinerary…</div>
      </main>
    );
  }

  const currentVersion = itineraryState.current_version;
  const result = currentVersion.result;
  const finalItinerary = result.final_itinerary;
  const days = finalItinerary.days;
  const dayNumbers = days.map(day => day.day_number);
  const selectedDay = days.find(day => day.day_number === activeDay) || days[0];
  const selectedDayCost = dayCostRange(selectedDay);
  const allCosts = days.flatMap(day => { const range = dayCostRange(day); return [range.low, range.high]; });
  const costMin = Math.min(...allCosts, 0);
  const costMax = Math.max(...allCosts, 1);
  const locations = routeLocations(days);
  const proposedRevision = itineraryState.proposed_revision;

  return (
    <main className="wrap dashboard">
      <TripHero
        finalItinerary={finalItinerary}
        travelers={finalItinerary.trip_summary.travelers}
        unresolvedCount={result.unresolved.length}
        assumptionsCount={finalItinerary.assumptions.length}
        confirmedCount={anchors.length}
        onJumpToUnresolved={result.unresolved.length > 0 ? () => document.getElementById('assumptions-panel')?.scrollIntoView({ behavior: 'smooth' }) : undefined}
        onJumpToAssumptions={finalItinerary.assumptions.length > 0 ? () => document.getElementById('assumptions-panel')?.scrollIntoView({ behavior: 'smooth' }) : undefined}
        actions={<>
          <button className="btn btn-ghost" type="button" onClick={() => alert('PDF generation is not available yet.')}>📄 PDF</button>
          <button className="btn btn-ghost" type="button" onClick={() => alert('Sharing is not available yet.')}>🔗 Share</button>
        </>}
      />
      <p className="version-note">Itinerary version {currentVersion.version}.</p>

      {priorVersions.length > 0 && (
        <details className="prior-versions">
          <summary>Prior versions ({priorVersions.length})</summary>
          {priorVersions.map(entry => (
            <details className="prior-version-entry" key={entry.version}>
              <summary>Version {entry.version}</summary>
              <ul>{entry.days.map(day => <li key={day.day_number}>Day {day.day_number}: {day.title}</li>)}</ul>
            </details>
          ))}
        </details>
      )}

      {(finalItinerary.assumptions.length > 0 || result.unresolved.length > 0) && (
        <section id="assumptions-panel" className="assumptions-panel" aria-label="Assumptions and unresolved items">
          {finalItinerary.assumptions.length > 0 && (
            <div>
              <h3>Planning assumptions</h3>
              <div className="status-card-list">
                {finalItinerary.assumptions.map((item, index) => (
                  <div className="status-card" key={index}>
                    <span className="badge">{item.category}</span>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.unresolved.length > 0 && (
            <div>
              <h3>Unresolved</h3>
              <div className="status-card-list">
                {result.unresolved.map((item, index) => (
                  <div className="status-card" key={index}>
                    <span className="badge badge-unresolved">{item.item}</span>
                    <p>{item.generic_guidance}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {finalItinerary.practical_notes.length > 0 && (
        <section aria-label="Practical notes" className="practical-notes">
          <h3>Practical notes</h3>
          {finalItinerary.practical_notes.map((note, index) => <article className="dashboard-card" key={index}><strong>{note.title}</strong><p>{note.detail}</p></article>)}
        </section>
      )}

      {proposedRevision && (
        <section className="revision-review" aria-label="Proposed itinerary revision">
          <strong>⚠️ This affects Day{proposedRevision.affected_days.length > 1 ? 's' : ''} {proposedRevision.affected_days.join(' and ')}</strong>
          <ul>{proposedRevision.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
          {revisionError && <p className="revision-error" role="alert">{revisionError}</p>}
          <div>
            <button type="button" className="btn btn-ghost" disabled={revisionPending} onClick={() => resolveRevision('keep_current_itinerary')}>Keep current</button>
            <button type="button" className="btn btn-primary" disabled={revisionPending} onClick={() => resolveRevision('accept_itinerary_revision')}>Accept changes</button>
          </div>
        </section>
      )}

      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">{TABS.map(({ name, icon }) => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}><span className="tab-icon">{icon}</span> {name}</button>)}</nav>

      {tab === 'Days' && selectedDay && <section aria-label="Detailed days" className="dashboard-days-wrap">
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
              {selectedDay.timeline.map((item, index) => <details className="atlas-item" key={index}>
                <span className="atlas-dot">{timelineIcon(item.kind)}</span>
                <div>
                  <summary>
                    <time>{item.start_time || 'Flexible'}{item.end_time ? ` – ${item.end_time}` : ''}</time>
                    <div className="item-summary-row">
                      <strong>{item.title}</strong>
                      {moneyRange(item.estimated_cost_low, item.estimated_cost_high) && <span className="item-cost">{moneyRange(item.estimated_cost_low, item.estimated_cost_high)}</span>}
                      <BookingReadinessBadge status={item.booking_readiness} />
                      <span className="expand-hint">Details →</span>
                    </div>
                  </summary>
                  <p>{item.detail}</p>
                  {item.movement_guidance && <p className="movement-guidance">{item.movement_guidance}</p>}
                </div>
              </details>)}
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
            {confirmType === 'activity' ? (
              <ConfirmationForm dayOptions={dayNumbers} fields={confirmFields} setFields={setConfirmFields} onSubmit={submitConfirmForm} onCancel={() => setConfirmType(null)} pending={confirmPending} error={confirmError} />
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => openConfirmForm('activity', selectedDay.day_number)}>Confirm something for this day</button>
            )}
          </article>
        </div>
      </section>}

      {tab === 'Transport' && <section>
        <div className="tab-intro"><div><h2>🚗 Transport</h2><p>Confirmed bookings only — arrange yours when you're ready.</p></div></div>
        <AnchorList anchors={anchorsByType(anchors, 'transport')} />
        <div className="booking-choice">
          <div className="booking-choice-opt">
            {confirmType === 'transport' ? (
              <ConfirmationForm dayOptions={dayNumbers} fields={confirmFields} setFields={setConfirmFields} onSubmit={submitConfirmForm} onCancel={() => setConfirmType(null)} pending={confirmPending} error={confirmError} />
            ) : (
              <>
                <strong>Already booked this yourself?</strong>
                <p>Add the confirmation and it'll show up here as locked.</p>
                <button type="button" className="btn btn-ghost" onClick={() => openConfirmForm('transport')}>Add a confirmation</button>
              </>
            )}
          </div>
          <span className="booking-choice-or">or</span>
          <div className="booking-choice-opt">
            <strong>Still need to arrange it?</strong>
            <p>Browse real options and pick one.</p>
            <Link className="btn btn-primary" to="/logistics?tab=Transport" onClick={() => trackEvent('booking_intent', { booking_type: 'browse_options' })}>Arrange bookings →</Link>
          </div>
        </div>
      </section>}

      {tab === 'Stays' && <section>
        <div className="tab-intro"><div><h2>🏨 Stays</h2><p>Confirmed bookings only — arrange yours when you're ready.</p></div></div>
        <AnchorList anchors={anchorsByType(anchors, 'stay')} />
        <div className="booking-choice">
          <div className="booking-choice-opt">
            {confirmType === 'stay' ? (
              <ConfirmationForm dayOptions={dayNumbers} fields={confirmFields} setFields={setConfirmFields} onSubmit={submitConfirmForm} onCancel={() => setConfirmType(null)} pending={confirmPending} error={confirmError} />
            ) : (
              <>
                <strong>Already booked this yourself?</strong>
                <p>Add the confirmation and it'll show up here as locked.</p>
                <button type="button" className="btn btn-ghost" onClick={() => openConfirmForm('stay')}>Add a confirmation</button>
              </>
            )}
          </div>
          <span className="booking-choice-or">or</span>
          <div className="booking-choice-opt">
            <strong>Still need to arrange it?</strong>
            <p>Browse real options and pick one.</p>
            <Link className="btn btn-primary" to="/logistics?tab=Stays" onClick={() => trackEvent('booking_intent', { booking_type: 'browse_options' })}>Arrange bookings →</Link>
          </div>
        </div>
      </section>}

      {tab === 'Map' && <section>
        <div className="tab-intro"><div><h2>🗺️ Route order</h2><p>Live coordinates aren't available yet — here's the order of the trip.</p></div></div>
        <ol className="route-order-list" aria-label="Route order">
          {locations.map((location, index) => <li key={`${index}-${location}`}>{location}</li>)}
        </ol>
      </section>}

      {tab === 'Budget breakdown' && <section>
        <div className="tab-intro"><div><h2>💰 Estimated budget breakdown</h2><p>{finalItinerary.budget_summary.budget_fit}</p></div></div>
        <div className="budget-summary-card">
          {finalItinerary.budget_summary.lines.map((line, index) => <div className="budget-summary-row" key={index}><span>{line.category}</span><strong>{moneyRange(line.amount_low, line.amount_high)}</strong><p>{line.note}</p></div>)}
          <div className="budget-summary-row total"><span>Estimated total</span><strong>{moneyRange(finalItinerary.budget_summary.total_low, finalItinerary.budget_summary.total_high)}</strong></div>
        </div>
        {finalItinerary.sources.length > 0 && (
          <div className="sources-list"><h3>Sources</h3><ul>{finalItinerary.sources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul></div>
        )}
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
