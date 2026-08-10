import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { computeBudget, createAtlasDashboardState, currentAtlasVersion } from '../lib/mockAtlasTrip.js';
import '../styles/dashboard.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function ItineraryPreview() {
  const navigate = useNavigate();
  const { trip, updateTrip } = useTrip();
  const atlas = trip.atlasState || createAtlasDashboardState(trip.guideSnapshot, trip.tripContext);
  const version = currentAtlasVersion(atlas);
  const budget = computeBudget(atlas.cost_items);

  useEffect(() => {
    if (!trip.atlasState) updateTrip({ atlasState: atlas });
    // Persist the authoritative Atlas-shaped fixture once for refresh/resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="wrap atlas-preview">
      <span className="eyebrow">Atlas detailed itinerary · Version {version.number}</span>
      <h1>Your <em>14-day Madhya Pradesh</em> itinerary</h1>
      <p className="lede">A useful detailed plan before dates or bookings. Assumptions stay visible and will be reviewed when logistics are confirmed.</p>
      <div className="readiness-row"><span>Duration-only · Day 1–14</span><span>{atlas.booking_readiness.replaceAll('_', ' ')}</span><span>{money(budget.low)}–{money(budget.high)} for two</span></div>

      <section className="assumption-panel" aria-label="Planning assumptions">
        <h2>What Atlas is assuming</h2>
        <ul>{atlas.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
        <h3>Still unresolved</h3>
        <div className="chip-row">{atlas.unresolved.map(item => <span className="chip" key={item}>{item}</span>)}</div>
      </section>

      {version.days.map(day => (
        <article className="atlas-day" key={day.number}>
          <header><div><span>DAY {day.number} · {day.base}</span><h2>{day.title}</h2></div><strong>{money(day.cost_inr.low)}–{money(day.cost_inr.high)}</strong></header>
          {day.items.map(item => <div className="atlas-item" key={item.id}><time>{item.time}</time><div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}<small>{item.status} · {item.flexibility}</small></div></div>)}
        </article>
      ))}

      <section className="budget-panel"><h2>Qualified trip estimate</h2>{atlas.cost_items.map(item => <div key={item.id}><span>{item.label}</span><strong>{money(item.low)}–{money(item.high)}</strong></div>)}<div className="budget-total"><span>Total for two</span><strong>{money(budget.low)}–{money(budget.high)}</strong></div><small>Planning estimate only — prices and availability are not live-checked.</small></section>
      <div className="preview-footer"><button type="button" className="btn btn-ghost" onClick={() => alert('Prototype — PDF generation remains a placeholder.')}>Download PDF (coming later)</button><button type="button" className="btn btn-primary" onClick={() => navigate('/choose-plan')}>Choose how to manage this trip →</button></div>
    </main>
  );
}
