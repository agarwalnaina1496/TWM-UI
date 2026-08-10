import { useState } from 'react';
import { useTrip } from '../context/TripContext.jsx';
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

const MODE_ICONS = [
  [/train/i, '🚆'], [/flight/i, '✈️'], [/bus/i, '🚌'], [/road/i, '🚗'],
];
const modeIcon = mode => (MODE_ICONS.find(([re]) => re.test(mode)) || [null, '🧭'])[1];

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

export default function TripDashboard() {
  const { trip, updateTrip } = useTrip();
  const [tab, setTab] = useState('Days');
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
  const tripDatesLabel = atlas.start_date || (atlas.scenario_id?.includes('year_end') ? 'Dec – Jan' : 'Flexible dates');

  return (
    <main className="wrap dashboard">
      <section className="dashboard-hero">
        <div className="hero-top">
          <div className="hero-actions"><button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — PDF generation is simulated.')}>📄 PDF</button><button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — sharing is simulated.')}>🔗 Share</button></div>
        </div>
        <h1 className="hero-title">Your <em>circuit</em> escape</h1>
        <p className="hero-desc">Built for two who want forts, temples and unhurried travel across four bases — Gwalior, Orchha, Khajuraho and Panna — over fourteen flexible days.</p>
        <div className="hero-stats">
          <div><strong>{version.days.length}</strong><span>Days</span></div>
          <div><strong>{travelers}</strong><span>Travelers</span></div>
          <div><strong>{tripDatesLabel}</strong><span>Trip dates</span></div>
          <div><strong>{money(budget.low)}–{money(budget.high)}</strong><span>Total for {travelers}</span></div>
        </div>
        <div className="hero-why">
          <span className="hero-why-label">Why this route</span>
          <p>Gwalior anchors the arrival gateway from Delhi. Orchha and Khajuraho follow without backtracking, adding riverside forts and temple heritage. Panna closes the loop as a reserve-edge stay before the return leg — the order keeps every transfer moving forward, not in circles.</p>
        </div>
      </section>
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
        <div className="tab-intro"><div><h2>🚗 Transport</h2><p>Real route and operator links — verify schedules and fares for your dates.</p></div><button type="button" className="btn btn-primary" onClick={() => save(addUploadedBooking(atlas, 'Transport'))}>Upload transport confirmation</button></div>
        {atlas.transport.map(item => <div className="stay-block" key={item.id}>
          <div className="stay-block-head">
            <div><span className={`state ${item.state}`}>{item.state === 'confirmed' ? '✓ confirmed' : item.state}</span><h3>{item.route}</h3><p>{item.options} · <strong className="price-tag">{item.price}</strong></p></div>
            {item.confirmation && <div className="confirmation-chip">✓ {item.confirmation}</div>}
          </div>
          <div className="stay-options-grid">{item.choices.map((choice, index) => <article className={`stay-option-card${index === 0 ? ' picked' : ''}`} key={`${item.id}-${choice.mode}-${choice.name}`}>
            {index === 0 && <span className="pick-badge">Curated pick</span>}
            <span className="mode-icon">{modeIcon(choice.mode)}</span>
            <strong>{choice.name}</strong>
            <span className="stay-option-tag">{choice.mode}</span>
            <p>{choice.note}</p>
            <a className={`btn ${index === 0 ? 'btn-primary' : 'btn-ghost'}`} href={choice.url} target="_blank" rel="noreferrer">Check ↗</a>
          </article>)}</div>
        </div>)}
        <BookingRecords bookings={atlas.bookings} type="Transport" />
      </section>}

      {tab === 'Stays' && <section>
        <div className="tab-intro"><div><h2>🏨 Stays</h2><p>Real properties for every base — check dates and price before booking.</p></div><button type="button" className="btn btn-primary" onClick={() => save(addUploadedBooking(atlas, 'Stay'))}>Upload stay confirmation</button></div>
        {atlas.stays.map(stay => <div className="stay-block" key={stay.id}>
          <div className="stay-block-head">
            <div><span className={`state ${stay.state}`}>{stay.state === 'confirmed' ? '✓ confirmed' : stay.state}</span><h3>🏨 {stay.base} · {stay.nights} nights</h3><p>📍 {stay.area} · {stay.nightly}</p></div>
          </div>
          <div className="stay-options-grid">{stay.options.map((option, index) => <article className={`stay-option-card${index === 0 ? ' picked' : ''}`} key={`${stay.id}-${option.name}`}>
            {index === 0 && <span className="pick-badge">Curated pick</span>}
            <strong>{option.name}</strong>
            <span className="stay-option-tag">Suggested option</span>
            <p>{option.fit}</p>
            <a className={`btn ${index === 0 ? 'btn-primary' : 'btn-ghost'}`} href={option.url} target="_blank" rel="noreferrer">Check stay ↗</a>
          </article>)}</div>
        </div>)}
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
