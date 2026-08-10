import { useState } from 'react';
import { useTrip } from '../context/TripContext.jsx';
import { acceptProposedRevision, addUploadedBooking, computeBudget, confirmArrival, confirmStay, createAtlasDashboardState, currentAtlasVersion, keepCurrentRevision } from '../lib/mockAtlasTrip.js';
import '../styles/dashboard.css';

const TABS = ['Days', 'Transport', 'Stays', 'Map'];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

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

  return (
    <main className="wrap dashboard">
      <span className="eyebrow">Trip Dashboard</span>
      <div className="dashboard-title"><div><h1>Madhya Pradesh <em>| 14 days</em></h1><p>No dates confirmed · Itinerary version {version.number}</p></div><div><button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — PDF generation is simulated.')}>PDF</button><button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — sharing is simulated.')}>Share</button></div></div>
      <div className="dashboard-budget">Current qualified estimate for two: <strong>{money(budget.low)}–{money(budget.high)}</strong></div>
      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">{TABS.map(name => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}</nav>

      {atlas.proposed_revision && <section className="revision-review" aria-label="Proposed itinerary revision"><strong>Booking affects Days {atlas.proposed_revision.affected_days.join(' and ')}</strong><p>{atlas.proposed_revision.reason}</p><ul>{atlas.proposed_revision.changes.map(change => <li key={change}>{change}</li>)}</ul><div><button type="button" className="btn btn-ghost" onClick={() => save(keepCurrentRevision(atlas))}>Keep current</button><button type="button" className="btn btn-primary" onClick={() => save(acceptProposedRevision(atlas))}>Accept changes</button></div></section>}

      {tab === 'Days' && <section aria-label="Detailed days">{version.days.map(day => <article className="atlas-day compact" key={day.number}><header><div><span>DAY {day.number} · {day.base}</span><h2>{day.title}</h2></div></header>{day.items.map(item => <div className="atlas-item" key={item.id}><time>{item.time}</time><div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}<small>{item.status} · {item.flexibility}</small></div></div>)}</article>)}</section>}

      {tab === 'Transport' && <section><div className="tab-intro"><div><h2>Transport</h2><p>Real route and operator links; schedules, availability and fares must be checked for your dates.</p></div><button type="button" className="btn btn-primary" onClick={() => save(addUploadedBooking(atlas, 'Transport'))}>Upload transport confirmation</button></div>{atlas.transport.map(item => <article className="dashboard-card option-card" key={item.id}><div><span className={`state ${item.state}`}>{item.state}</span><h3>{item.route}</h3><p>{item.options} · {item.price}</p>{item.confirmation && <strong>{item.confirmation}</strong>}<div className="provider-options">{item.choices.map(choice => <div className="provider-option" key={`${item.id}-${choice.mode}-${choice.name}`}><span>{choice.mode}</span><div><strong>{choice.name}</strong><p>{choice.note}</p></div><a className="btn btn-ghost" href={choice.url} target="_blank" rel="noreferrer">Check option ↗</a></div>)}</div></div>{item.id === 'delhi-gwalior' && item.state !== 'confirmed' && <button type="button" className="btn btn-ghost" onClick={() => save(confirmArrival(atlas))}>Simulate confirmed 2:00 PM arrival</button>}</article>)}<BookingRecords bookings={atlas.bookings} type="Transport" /></section>}

      {tab === 'Stays' && <section><div className="tab-intro"><div><h2>Stays</h2><p>Real properties for every base; check dates and total price directly before booking.</p></div><button type="button" className="btn btn-primary" onClick={() => save(addUploadedBooking(atlas, 'Stay'))}>Upload stay confirmation</button></div>{atlas.stays.map(stay => <article className="dashboard-card option-card" key={stay.id}><div><span className={`state ${stay.state}`}>{stay.state}</span><h3>{stay.base} · {stay.nights} nights</h3><p>{stay.area} · {stay.nightly}</p>{stay.confirmation && <strong>{stay.confirmation}</strong>}<div className="provider-options">{stay.options.map(option => <div className="provider-option" key={`${stay.id}-${option.name}`}><span>Stay</span><div><strong>{option.name}</strong><p>{option.fit}</p></div><a className="btn btn-ghost" href={option.url} target="_blank" rel="noreferrer">Check stay ↗</a></div>)}</div></div>{stay.state !== 'confirmed' && <button type="button" className="btn btn-ghost" onClick={() => save(confirmStay(atlas, stay.id))}>Simulate booked stay</button>}</article>)}<BookingRecords bookings={atlas.bookings} type="Stay" /></section>}

      {tab === 'Map' && <section><div className="tab-intro"><div><h2>Circuit map</h2><p>Only fixture locations with known coordinates are shown.</p></div></div><div className="map-placeholder" role="img" aria-label="Route from Gwalior through Orchha and Khajuraho to Panna">{atlas.map_points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)).map((point, index) => <div key={point.id}><span>{index + 1}</span><strong>{point.label}</strong><small>{point.lat}, {point.lng}</small></div>)}</div></section>}

      <small>Fixture-backed Self-Led Dashboard — no provider, OCR, booking or Atlas call was made.</small>
    </main>
  );
}
