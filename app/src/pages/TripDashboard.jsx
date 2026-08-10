import { useState } from 'react';
import { useTrip } from '../context/TripContext.jsx';
import { acceptProposedRevision, addUploadedBooking, adjustFlexibleItem, computeBudget, confirmArrival, confirmStay, createAtlasDashboardState, currentAtlasVersion, keepCurrentRevision } from '../lib/mockAtlasTrip.js';
import '../styles/dashboard.css';

const TABS = ['Days', 'Transport', 'Stays', 'Bookings', 'Map'];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function TripDashboard() {
  const { trip, updateTrip } = useTrip();
  const [tab, setTab] = useState('Days');
  const [editingDay, setEditingDay] = useState(null);
  const atlas = trip.atlasState || createAtlasDashboardState(trip.guideSnapshot, trip.tripContext);
  const version = currentAtlasVersion(atlas);
  const budget = computeBudget(atlas.cost_items);
  const save = next => updateTrip({ atlasState: next });

  return (
    <main className="wrap dashboard">
      <span className="eyebrow">Self-Led Trip Dashboard</span>
      <div className="dashboard-title"><div><h1>Madhya Pradesh <em>| 14 days</em></h1><p>No dates confirmed · Itinerary version {version.number}</p></div><div><button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — PDF generation is simulated.')}>PDF</button><button className="btn btn-ghost" type="button" onClick={() => alert('Prototype — sharing is simulated.')}>Share</button></div></div>
      <div className="dashboard-budget">Current qualified estimate for two: <strong>{money(budget.low)}–{money(budget.high)}</strong></div>
      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">{TABS.map(name => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>{name}</button>)}</nav>

      {atlas.proposed_revision && <section className="revision-review" aria-label="Proposed itinerary revision"><strong>Booking affects Days {atlas.proposed_revision.affected_days.join(' and ')}</strong><p>{atlas.proposed_revision.reason}</p><ul>{atlas.proposed_revision.changes.map(change => <li key={change}>{change}</li>)}</ul><div><button type="button" className="btn btn-ghost" onClick={() => save(keepCurrentRevision(atlas))}>Keep current</button><button type="button" className="btn btn-primary" onClick={() => save(acceptProposedRevision(atlas))}>Accept changes</button></div></section>}

      {tab === 'Days' && <section aria-label="Detailed days"><div className="tab-intro"><div><h2>Detailed days</h2><p>Confirmed anchors are locked. Flexible suggestions can be deliberately adjusted.</p></div><button type="button" className="btn btn-ghost" onClick={() => setEditingDay(editingDay ? null : 1)}>{editingDay ? 'Done editing' : 'Adjust trip'}</button></div>{version.days.map(day => <article className="atlas-day compact" key={day.number}><header><div><span>DAY {day.number} · {day.base}</span><h2>{day.title}</h2></div>{editingDay === day.number ? <button type="button" onClick={() => setEditingDay(null)}>Done</button> : editingDay && <button type="button" onClick={() => setEditingDay(day.number)}>Edit day</button>}</header>{day.items.map(item => <div className="atlas-item" key={item.id}><time>{item.time}</time><div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}<small>{item.status} · {item.flexibility}</small></div>{editingDay === day.number && <button type="button" disabled={item.flexibility === 'locked'} onClick={() => save(adjustFlexibleItem(atlas, day.number, item.id))}>{item.flexibility === 'locked' ? 'Locked' : 'Edit'}</button>}</div>)}</article>)}</section>}

      {tab === 'Transport' && <section><div className="tab-intro"><div><h2>Transport</h2><p>Suggested planning options—not live inventory or guaranteed prices.</p></div></div>{atlas.transport.map(item => <article className="dashboard-card" key={item.id}><div><span className={`state ${item.state}`}>{item.state}</span><h3>{item.route}</h3><p>{item.options} · {item.price}</p>{item.confirmation && <strong>{item.confirmation}</strong>}</div>{item.id === 'delhi-gwalior' && item.state !== 'confirmed' && <button type="button" className="btn btn-ghost" onClick={() => save(confirmArrival(atlas))}>Simulate confirmed 2:00 PM arrival</button>}</article>)}</section>}

      {tab === 'Stays' && <section><div className="tab-intro"><div><h2>Stays</h2><p>Areas and ranges are suggestions; no hotel is fabricated as booked.</p></div></div>{atlas.stays.map(stay => <article className="dashboard-card" key={stay.id}><div><span className={`state ${stay.state}`}>{stay.state}</span><h3>{stay.base} · {stay.nights} nights</h3><p>{stay.area} · {stay.nightly}/night</p>{stay.confirmation && <strong>{stay.confirmation}</strong>}</div>{stay.state !== 'confirmed' && <button type="button" className="btn btn-ghost" onClick={() => save(confirmStay(atlas, stay.id))}>Simulate booked stay</button>}</article>)}</section>}

      {tab === 'Bookings' && <section><div className="tab-intro"><div><h2>Bookings</h2><p>Add confirmations without silently rewriting your itinerary.</p></div><button type="button" className="btn btn-primary" onClick={() => save(addUploadedBooking(atlas))}>Upload confirmation</button></div>{atlas.bookings.length === 0 ? <div className="empty-dashboard"><h3>No bookings yet</h3><p>Your detailed itinerary remains useful while transport and stays are still open.</p><button type="button" className="btn btn-ghost" onClick={() => save(addUploadedBooking(atlas))}>Add manually</button></div> : atlas.bookings.map(booking => <article className="dashboard-card" key={booking.id}><div><span className={`state ${booking.state}`}>{booking.state.replace('_', ' ')}</span><h3>{booking.label}</h3><p>{booking.type} · {booking.detail}</p></div></article>)}</section>}

      {tab === 'Map' && <section><div className="tab-intro"><div><h2>Circuit map</h2><p>Only fixture locations with known coordinates are shown.</p></div></div><div className="map-placeholder" role="img" aria-label="Route from Gwalior through Orchha and Khajuraho to Panna">{atlas.map_points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)).map((point, index) => <div key={point.id}><span>{index + 1}</span><strong>{point.label}</strong><small>{point.lat}, {point.lng}</small></div>)}</div></section>}

      <small>Fixture-backed Self-Led Dashboard — no provider, OCR, booking or Atlas call was made.</small>
    </main>
  );
}
