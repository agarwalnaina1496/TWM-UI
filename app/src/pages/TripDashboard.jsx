import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import TripHero from '../components/TripHero.jsx';
import { acceptProposedRevision, addUploadedBooking, computeBudget, createAtlasDashboardState, currentAtlasVersion, keepCurrentRevision, TRAVEL_TIPS } from '../lib/mockAtlasTrip.js';
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

const TIME_ICONS = [
  [/morning/i, '🌅'], [/afternoon/i, '🌤️'], [/evening/i, '🌆'], [/flexible/i, '🕒'], [/\d(am|pm)/i, '⏰'],
];
const timeIcon = time => (TIME_ICONS.find(([re]) => re.test(time)) || [null, '📍'])[1];

const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

function BudgetBar({ low, high, min, max }) {
  const span = Math.max(max - min, 1);
  const left = ((low - min) / span) * 100;
  const width = Math.max(((high - low) / span) * 100, 3);
  return <div className="budget-track"><div className="budget-fill" style={{ left: `${left}%`, width: `${width}%` }} /></div>;
}

function BookingRecords({ bookings, type }) {
  const records = bookings.filter(booking => booking.type === type);
  if (records.length === 0) return null;
  return <div className="booking-records"><h3>{type} confirmations</h3>{records.map(booking => <article className="dashboard-card" key={booking.id}><div><span className={`state ${booking.state}`}>{booking.state.replace('_', ' ')}</span><strong>{booking.label}</strong><p>{booking.detail}</p></div></article>)}</div>;
}

function BookingChoice({ label, logisticsTab, onUpload }) {
  return (
    <div className="booking-choice">
      <div className="booking-choice-opt">
        <strong>Already booked this yourself?</strong>
        <p>Upload your confirmation and it'll show up here.</p>
        <button type="button" className="btn btn-ghost" onClick={onUpload}>Upload {label} confirmation</button>
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
  const { trip, updateTrip } = useTrip();
  const [params] = useSearchParams();
  const initialTab = TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Days';
  const [tab, setTab] = useState(initialTab);
  const atlas = trip.atlasState || createAtlasDashboardState(trip.guideSnapshot, trip.tripContext);
  const version = currentAtlasVersion(atlas);
  const budget = computeBudget(atlas.cost_items);
  const save = next => updateTrip({ atlasState: next });
  const [activeDay, setActiveDay] = useState(version.days[0]?.number);
  const selectedDay = version.days.find(day => day.number === activeDay) || version.days[0];
  const allCosts = version.days.flatMap(d => [d.cost_inr.low, d.cost_inr.high]);
  const costMin = Math.min(...allCosts);
  const costMax = Math.max(...allCosts);
  const dayTips = TRAVEL_TIPS.slice((selectedDay.number - 1) % TRAVEL_TIPS.length).concat(TRAVEL_TIPS).slice(0, 2);
  const mapPoints = atlas.map_points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  const travelers = trip.travelers || 2;

  return (
    <main className="wrap dashboard">
      <TripHero atlas={atlas} version={version} travelers={travelers} actions={<>
        <button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — PDF generation is simulated.')}>📄 PDF</button>
        <button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — sharing is simulated.')}>🔗 Share</button>
      </>} />
      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">{TABS.map(({ name, icon }) => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}><span className="tab-icon">{icon}</span> {name}</button>)}</nav>

      {atlas.proposed_revision && <section className="revision-review" aria-label="Proposed itinerary revision"><strong>⚠️ Booking affects Days {atlas.proposed_revision.affected_days.join(' and ')}</strong><p>{atlas.proposed_revision.reason}</p><ul>{atlas.proposed_revision.changes.map(change => <li key={change}>{change}</li>)}</ul><div><button type="button" className="btn btn-ghost" onClick={() => save(keepCurrentRevision(atlas))}>Keep current</button><button type="button" className="btn btn-primary" onClick={() => save(acceptProposedRevision(atlas))}>Accept changes</button></div></section>}

      {tab === 'Days' && selectedDay && <section aria-label="Detailed days" className="dashboard-days-wrap">
        <nav className="dashboard-day-nav" aria-label="Select a day">
          {version.days.map(day => <button type="button" key={day.number} className={`dashboard-day-pill${day.number === selectedDay.number ? ' active' : ''}`} aria-current={day.number === selectedDay.number ? 'page' : undefined} onClick={() => setActiveDay(day.number)}>
            <span className="pill-num">{day.number}</span>
            <span className="pill-text"><span className="label">Day {day.number}</span><span className="base">{day.base}</span></span>
          </button>)}
        </nav>
        <div className="dashboard-days-main">
          <article className="atlas-day compact">
            <header>
              <span className="atlas-day-eyebrow">Day {String(selectedDay.number).padStart(2, '0')} · {version.days.length} days total</span>
              <h2>{selectedDay.title}</h2>
              <p className="atlas-day-route">📍 {selectedDay.base}</p>
            </header>
            <div className="atlas-timeline">
              {selectedDay.items.map(item => <div className={`atlas-item flex-${item.flexibility}`} key={item.id}>
                <span className="atlas-dot">{timeIcon(item.time)}</span>
                <div>
                  <time>{item.time}</time>
                  <strong>{item.title}</strong>
                  {item.note && <p>{item.note}</p>}
                  {(item.status === 'confirmed' || item.flexibility === 'locked') && <span className={`badge badge-${item.status}`}>{item.status === 'confirmed' ? '✓ confirmed' : '🔒 locked'}</span>}
                </div>
              </div>)}
            </div>
            <div className="atlas-day-footer">
              <div className="footer-budget">
                <span className="footer-label">💰 Budget for two</span>
                <strong>{money(selectedDay.cost_inr.low)}–{money(selectedDay.cost_inr.high)}</strong>
                <BudgetBar low={selectedDay.cost_inr.low} high={selectedDay.cost_inr.high} min={costMin} max={costMax} />
              </div>
              <div className="footer-tips">
                <span className="footer-label">🎒 Good to know</span>
                <ul className="tips-list">{dayTips.map(tip => <li key={tip.text}><span>{tip.icon}</span>{tip.text}</li>)}</ul>
              </div>
            </div>
          </article>
        </div>
      </section>}

      {tab === 'Transport' && <section>
        <div className="tab-intro"><div><h2>🚗 Transport</h2><p>What's confirmed so far for getting around — a view only, not a booking desk.</p></div></div>
        {atlas.transport.filter(item => item.state === 'confirmed').map(item => <article className="dashboard-card" key={item.id}>
          <div><span className="state confirmed">✓ confirmed</span><h3>{item.route}</h3>
            {item.confirmation && <div className="confirmation-chip">✓ {item.confirmation}</div>}
          </div>
        </article>)}
        <BookingRecords bookings={atlas.bookings} type="Transport" />
        <BookingChoice label="transport" logisticsTab="Transport" onUpload={() => save(addUploadedBooking(atlas, 'Transport'))} />
      </section>}

      {tab === 'Stays' && <section>
        <div className="tab-intro"><div><h2>🏨 Stays</h2><p>What's confirmed so far for stays — a view only, not a booking desk.</p></div></div>
        {atlas.stays.filter(stay => stay.state === 'confirmed').map(stay => <article className="dashboard-card" key={stay.id}>
          <div><span className="state confirmed">✓ confirmed</span><h3>🏨 {stay.base} · {stay.nights} nights</h3><p>📍 {stay.area}</p>
            {stay.confirmation && <div className="confirmation-chip">✓ {stay.confirmation}</div>}
          </div>
        </article>)}
        <BookingRecords bookings={atlas.bookings} type="Stay" />
        <BookingChoice label="stay" logisticsTab="Stays" onUpload={() => save(addUploadedBooking(atlas, 'Stay'))} />
      </section>}

      {tab === 'Map' && <section>
        <div className="tab-intro"><div><h2>🗺️ Circuit map</h2><p>Only fixture locations with known coordinates are shown.</p></div></div>
        <div className="route-map" role="img" aria-label="Route from Gwalior through Orchha and Khajuraho to Panna">
          {mapPoints.map((point, index) => <div className="route-node-wrap" key={point.id}>
            <div className="route-node">
              <span className="route-marker">{index + 1}</span>
              <div><strong>{point.label}</strong><small>{point.lat}, {point.lng}</small></div>
            </div>
            {index < mapPoints.length - 1 && <div className="route-connector"><span className="route-line" /><span className="route-distance">~{haversineKm(point, mapPoints[index + 1])} km</span></div>}
          </div>)}
        </div>
      </section>}

      {tab === 'Budget breakdown' && <section>
        <div className="tab-intro"><div><h2>💰 Estimated budget breakdown</h2><p>Reference estimate for {travelers} travelers — mid-range comfort, not a hard cap.</p></div></div>
        <div className="budget-summary-card">
          {atlas.cost_items.map(item => <div className="budget-summary-row" key={item.id}><span>{item.label}</span><strong>{money(item.low)}–{money(item.high)}</strong></div>)}
          <div className="budget-summary-row total"><span>Estimated total</span><strong>{money(budget.low)}–{money(budget.high)}</strong></div>
        </div>
      </section>}

      {tab === 'Support' && <section>
        <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with this specific itinerary.</p></div></div>
        <section className="support-box">
          <span className="support-label">Questions or changes to this itinerary?</span>
          <p>This is specifically for support on the plan you've already received — swapping something, adjusting dates, or anything unclear. For actually booking the trip, use the option below instead.</p>
          <button type="button" className="btn btn-primary" onClick={() => alert('Prototype — this would open a conversation with the TravelWithMe team.')}>Talk to the TravelWithMe team</button>
        </section>
        <section className="booking-help-box">
          <div><h3>Want us to help book this trip?</h3><p>Our team can handle flights, stays, and every reservation end-to-end, so you don't have to.</p></div>
          <button type="button" className="btn btn-amber" onClick={() => alert('Prototype — this would start a TravelWithMe-led booking request.')}>Get booking help →</button>
        </section>
      </section>}

      <small>Fixture-backed Self-Led Dashboard — no provider, OCR, booking or Atlas call was made.</small>
    </main>
  );
}
