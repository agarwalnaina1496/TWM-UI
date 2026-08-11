import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import TripHero from '../components/TripHero.jsx';
import { bookingReadinessLabel, dayCostRange, routeLocations, timelineIcon } from '../lib/atlasView.js';
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

function InertBookingActions({ label, logisticsTab }) {
  return (
    <div className="booking-choice">
      <div className="booking-choice-opt">
        <strong>Already booked this yourself?</strong>
        <p>Confirmation upload is coming soon.</p>
        <button type="button" className="btn btn-ghost" disabled title="Coming soon">Upload {label} confirmation</button>
      </div>
      <span className="booking-choice-or">or</span>
      <div className="booking-choice-opt">
        <strong>Still need to arrange it?</strong>
        <p>Browse real options and pick one.</p>
        <Link className="btn btn-primary" to={`/logistics?tab=${logisticsTab}`}>Arrange bookings →</Link>
      </div>
    </div>
  );
}

export default function TripDashboard() {
  const { commandSnapshot, sendTripCommand } = useTrip();
  const [params] = useSearchParams();
  const initialTab = TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Days';
  const [tab, setTab] = useState(initialTab);
  const [activeDay, setActiveDay] = useState(null);

  const itineraryState = commandSnapshot?.trip_state?.itinerary_state;
  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const bootStarted = useRef(false);

  // Reopen never re-invokes Atlas: once ready, render the saved result and
  // never call start_itinerary again for this trip.
  useEffect(() => {
    if (itineraryState?.status === 'ready') {
      setBootStatus('ready');
      return;
    }
    if (bootStarted.current) return;
    bootStarted.current = true;
    setBootStatus('booting');
    sendTripCommand('start_itinerary')
      .then(() => setBootStatus('ready'))
      .catch(error => {
        setBootStatus('error');
        setBootError(error.message || 'Could not generate the detailed itinerary.');
      });
  }, [itineraryState?.status, sendTripCommand]);

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

  const result = itineraryState.result;
  const finalItinerary = result.final_itinerary;
  const days = finalItinerary.days;
  const selectedDay = days.find(day => day.day_number === activeDay) || days[0];
  const selectedDayCost = dayCostRange(selectedDay);
  const allCosts = days.flatMap(day => { const range = dayCostRange(day); return [range.low, range.high]; });
  const costMin = Math.min(...allCosts, 0);
  const costMax = Math.max(...allCosts, 1);
  const locations = routeLocations(days);

  return (
    <main className="wrap dashboard">
      <TripHero
        finalItinerary={finalItinerary}
        travelers={finalItinerary.trip_summary.travelers}
        actions={<>
          <button className="btn btn-ghost" type="button" onClick={() => alert('PDF generation is not available yet.')}>📄 PDF</button>
          <button className="btn btn-ghost" type="button" onClick={() => alert('Sharing is not available yet.')}>🔗 Share</button>
        </>}
      />
      <p className="version-note">Itinerary version {itineraryState.version}.</p>

      {(finalItinerary.assumptions.length > 0 || result.unresolved.length > 0) && (
        <section className="assumptions-panel" aria-label="Assumptions and unresolved items">
          {finalItinerary.assumptions.length > 0 && (
            <div><h3>Planning assumptions</h3><ul>{finalItinerary.assumptions.map((item, index) => <li key={index}><strong>{item.category}:</strong> {item.detail}</li>)}</ul></div>
          )}
          {result.unresolved.length > 0 && (
            <div><h3>Unresolved</h3><ul>{result.unresolved.map((item, index) => <li key={index}><strong>{item.item}:</strong> {item.generic_guidance}</li>)}</ul></div>
          )}
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
            <div className="atlas-timeline">
              {selectedDay.timeline.map((item, index) => <div className="atlas-item" key={index}>
                <span className="atlas-dot">{timelineIcon(item.kind)}</span>
                <div>
                  <time>{item.start_time || 'Flexible'}{item.end_time ? ` – ${item.end_time}` : ''}</time>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  {item.movement_guidance && <p className="movement-guidance">{item.movement_guidance}</p>}
                  <BookingReadinessBadge status={item.booking_readiness} />
                  {moneyRange(item.estimated_cost_low, item.estimated_cost_high) && <span className="item-cost">{moneyRange(item.estimated_cost_low, item.estimated_cost_high)}</span>}
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
          {finalItinerary.practical_notes.length > 0 && (
            <section aria-label="Practical notes" className="practical-notes">
              <h3>Practical notes</h3>
              {finalItinerary.practical_notes.map((note, index) => <article className="dashboard-card" key={index}><strong>{note.title}</strong><p>{note.detail}</p></article>)}
            </section>
          )}
        </div>
      </section>}

      {tab === 'Transport' && <section>
        <div className="tab-intro"><div><h2>🚗 Transport</h2><p>Atlas-suggested options — a view only, not a booking desk.</p></div></div>
        {finalItinerary.travel_options.map((option, index) => <article className="dashboard-card" key={index}>
          <div>
            <BookingReadinessBadge status={option.booking_readiness} />
            <h3>{option.from_place} → {option.to_place} · {option.mode}</h3>
            <p>{option.suggestion}</p>
            {option.duration_guidance && <p className="movement-guidance">{option.duration_guidance}</p>}
            {moneyRange(option.estimated_cost_low, option.estimated_cost_high) && <span className="item-cost">{moneyRange(option.estimated_cost_low, option.estimated_cost_high)}</span>}
            {option.reference.status === 'VERIFIED' && option.reference.source_url && <a className="source-link" href={option.reference.source_url} target="_blank" rel="noreferrer">{option.reference.source_title || 'Source'} ↗</a>}
          </div>
        </article>)}
        <InertBookingActions label="transport" logisticsTab="Transport" />
      </section>}

      {tab === 'Stays' && <section>
        <div className="tab-intro"><div><h2>🏨 Stays</h2><p>Atlas-suggested options — a view only, not a booking desk.</p></div></div>
        {finalItinerary.stay_options.map((option, index) => <article className="dashboard-card" key={index}>
          <div>
            <BookingReadinessBadge status={option.booking_readiness} />
            <h3>🏨 {option.location} · {option.nights} nights</h3>
            <p>Day {option.check_in_day} – Day {option.check_out_day}</p>
            <p>{option.suggestion}</p>
            <p>{option.why_it_fits}</p>
            {moneyRange(option.estimated_cost_low, option.estimated_cost_high) && <span className="item-cost">{moneyRange(option.estimated_cost_low, option.estimated_cost_high)}</span>}
            {option.reference.status === 'VERIFIED' && option.reference.source_url && <a className="source-link" href={option.reference.source_url} target="_blank" rel="noreferrer">{option.reference.source_title || 'Source'} ↗</a>}
          </div>
        </article>)}
        <InertBookingActions label="stay" logisticsTab="Stays" />
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
          <button type="button" className="btn btn-amber" onClick={() => alert('This would start a TravelWithMe-led booking request.')}>Get booking help →</button>
        </section>
      </section>}
    </main>
  );
}
