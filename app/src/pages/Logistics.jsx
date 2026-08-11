import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { acceptProposedRevision, confirmArrival, createAtlasDashboardState, currentAtlasVersion, keepCurrentRevision } from '../lib/mockAtlasTrip.js';
import '../styles/dashboard.css';

const TABS = [
  { name: 'Transport', icon: '🚗' },
  { name: 'Stays', icon: '🏨' },
];

const MODE_ICONS = [
  [/train/i, '🚆'], [/flight/i, '✈️'], [/bus/i, '🚌'], [/road/i, '🚗'],
];
const modeIcon = mode => (MODE_ICONS.find(([re]) => re.test(mode)) || [null, '🧭'])[1];

const HOTEL_GRADIENTS = ['linear-gradient(135deg,#d9c9a8,#b79a6c)', 'linear-gradient(135deg,#a9c3bd,#5f8a81)', 'linear-gradient(135deg,#e7c9bd,#c1806a)'];

function TransportChoice({ choice, picked }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`stay-option-card${picked ? ' picked' : ''}`}>
      {picked && <span className="pick-badge">Our pick</span>}
      <span className="mode-icon">{modeIcon(choice.mode)}</span>
      <strong>{choice.name}</strong>
      <span className="stay-option-tag">{choice.mode}</span>
      <button type="button" className="reason-toggle" onClick={() => setOpen(o => !o)}>Why this one <span>{open ? '▴' : '▾'}</span></button>
      {open && <p className="reason-body open">{choice.note}</p>}
      <a className={`btn ${picked ? 'btn-primary' : 'btn-ghost'}`} href={choice.url} target="_blank" rel="noreferrer">Check ↗</a>
    </article>
  );
}

export default function Logistics() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, updateTrip } = useTrip();
  const atlas = trip.atlasState || createAtlasDashboardState(trip.guideSnapshot, trip.tripContext);
  const version = currentAtlasVersion(atlas);
  const save = next => updateTrip({ atlasState: next });
  const initialTab = TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Transport';
  const [tab, setTab] = useState(initialTab);

  return (
    <main className="wrap dashboard">
      <span className="eyebrow">Arrange your bookings</span>
      <h1 className="hero-title">Book <em>{trip.destination?.name || 'your trip'}</em></h1>
      <p className="hero-desc">Pick real transport and stay options for every base — schedules, fares and prices are yours to verify before you book.</p>

      <nav className="dashboard-tabs" aria-label="Logistics tabs">{TABS.map(({ name, icon }) => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}><span className="tab-icon">{icon}</span> {name}</button>)}</nav>

      {atlas.proposed_revision && <section className="revision-review" aria-label="Proposed itinerary revision"><strong>⚠️ Booking affects Days {atlas.proposed_revision.affected_days.join(' and ')}</strong><p>{atlas.proposed_revision.reason}</p><ul>{atlas.proposed_revision.changes.map(change => <li key={change}>{change}</li>)}</ul><div><button type="button" className="btn btn-ghost" onClick={() => save(keepCurrentRevision(atlas))}>Keep current</button><button type="button" className="btn btn-primary" onClick={() => save(acceptProposedRevision(atlas))}>Accept changes</button></div></section>}

      {tab === 'Transport' && <section aria-label="Transport">
        <div className="tab-intro"><div><h2>🚗 Transport</h2><p>Real route and operator links — verify schedules and fares for your dates.</p></div></div>
        <p className="already-booked-note">Already booked this yourself? <Link to="/dashboard?tab=Transport">Upload it on your dashboard →</Link></p>
        {atlas.transport.map(item => <div className="stay-block" key={item.id}>
          <div className="stay-block-head">
            <div><span className={`state ${item.state}`}>{item.state === 'confirmed' ? '✓ confirmed' : item.state}</span><h3 className="route-title">{item.route.replace('→', ' ⋯⋯⋯→ ')}</h3><p><strong className="price-tag">{item.price}</strong></p></div>
            {item.confirmation && <div className="confirmation-chip">✓ {item.confirmation}</div>}
          </div>
          <div className="stay-options-grid">{item.choices.map((choice, index) => <TransportChoice choice={choice} picked={index === 0} key={`${item.id}-${choice.mode}-${choice.name}`} />)}</div>
          {item.id === 'delhi-gwalior' && item.state !== 'confirmed' && <button type="button" className="btn btn-ghost" onClick={() => save(confirmArrival(atlas))}>Simulate confirmed 2:00 PM arrival</button>}
        </div>)}
      </section>}

      {tab === 'Stays' && <section aria-label="Stays">
        <div className="tab-intro"><div><h2>🏨 Stays</h2><p>Real properties for every base — check dates and price before booking.</p></div></div>
        <p className="already-booked-note">Already booked this yourself? <Link to="/dashboard?tab=Stays">Upload it on your dashboard →</Link></p>
        {atlas.stays.map(stay => <div className="stay-block" key={stay.id}>
          <div className="stay-block-head">
            <div><span className={`state ${stay.state}`}>{stay.state === 'confirmed' ? '✓ confirmed' : stay.state}</span><h3>🏨 {stay.base} · {stay.nights} nights</h3><p>📍 {stay.area}</p></div>
          </div>
          <div className="hotel-rows">{stay.options.map((option, index) => <article className={`hotel-row${index === 0 ? ' picked' : ''}`} key={`${stay.id}-${option.name}`}>
            <div className="hotel-thumb" style={{ background: HOTEL_GRADIENTS[index % HOTEL_GRADIENTS.length] }} />
            <div className="hotel-body">
              {index === 0 && <span className="pick-badge">Our pick</span>}
              <strong>{option.name}</strong>
              <p>{option.fit}</p>
            </div>
            <a className={`btn ${index === 0 ? 'btn-primary' : 'btn-ghost'}`} href={option.url} target="_blank" rel="noreferrer">Check stay ↗</a>
          </article>)}</div>
        </div>)}
      </section>}

      <div className="preview-footer">
        <span className="lede">You can come back here anytime before your trip to arrange more bookings.</span>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard')}>Continue to dashboard →</button>
      </div>
      <small>Itinerary version {version.number}.</small>
    </main>
  );
}
