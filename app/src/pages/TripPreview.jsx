import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { approveGuidePlan, createInitialGuidePlan, executeGuideRevision } from '../lib/mockGuidePlan.js';
import { createAtlasDashboardState } from '../lib/mockAtlasTrip.js';
import '../styles/preview.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function TripPreview() {
  const navigate = useNavigate();
  const { trip, updateTrip } = useTrip();
  const [plan, setPlan] = useState(() => trip.guidePlan || createInitialGuidePlan(trip));
  const [message, setMessage] = useState('');
  const [newPlaces, setNewPlaces] = useState({});

  useEffect(() => {
    if (!trip.guidePlan) updateTrip({ guidePlan: plan });
    // The initial authoritative fixture is persisted once for refresh/resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function revise(command) {
    const response = executeGuideRevision(plan, { ...command, expected_revision: plan.revision });
    if (response.status !== 'SUCCESS') {
      setMessage(response.message);
      return;
    }
    setPlan(response.plan);
    updateTrip({ guidePlan: response.plan });
    setMessage(response.message);
  }

  function generate() {
    const response = approveGuidePlan(plan);
    if (response.status !== 'PLAN_APPROVED') {
      setMessage(response.message);
      return;
    }
    const atlasState = createAtlasDashboardState(response.snapshot, trip.tripContext);
    updateTrip({ guidePlan: plan, guideSnapshot: response.snapshot, atlasState, plan: null, tripLength: plan.summary.duration_days });
    navigate('/itinerary-preview');
  }

  return (
    <main className="wrap plan-builder">
      <Link className="back-link" to="/destinations">← Back to destinations</Link>
      <span className="eyebrow">Guide Plan Builder · Draft revision {plan.revision}</span>
      <h1>{plan.circuit.name} <em>| {plan.summary.duration_days} days</em></h1>
      <p className="lede">Shape the route, places, pace and broad days together. Dates can stay open until you book.</p>

      <section className="plan-summary" aria-label="Plan summary">
        <div><strong>{plan.summary.route_stops}</strong><span>route stops</span></div>
        <div><strong>{plan.summary.place_count}</strong><span>planned items</span></div>
        <div><strong>{plan.summary.duration_days}</strong><span>days</span></div>
        <div><strong>{money(plan.summary.rough_group_cost_inr.low)}–{money(plan.summary.rough_group_cost_inr.high)}</strong><span>rough total for two</span></div>
      </section>

      <section className="builder-controls" aria-label="Trip timing and pace">
        <label>Optional start date<input type="date" value={plan.start_date || ''} onChange={event => revise({ type: 'SET_START_DATE', value: event.target.value })} /></label>
        <div className="date-mode">{plan.start_date ? `${plan.start_date} → ${plan.end_date}` : `Duration-only · Day 1–${plan.summary.duration_days}`}</div>
        <label>Pace<select value={plan.pace} onChange={event => revise({ type: 'SET_PACE', value: event.target.value })}>
          <option>Easygoing and balanced — culture, relaxation and nature</option>
          <option>Slower with more downtime</option>
          <option>Active with fuller sightseeing days</option>
        </select></label>
      </section>

      {plan.route_warning && <div className="route-warning" role="alert">⚠ {plan.route_warning}</div>}
      {message && <div className="revision-message" role="status">{message}</div>}

      <section aria-label="Route and broad day plan">
        {plan.day_blocks.map((block, blockIndex) => (
          <article className="day-card route-block" key={block.id}>
            <header className="day-card-head">
              <div><span className="daynum">STOP {blockIndex + 1}</span><h2>{block.stop}</h2></div>
              <div className="route-actions">
                {block.id !== 'departure' && <>
                  <button type="button" aria-label={`Move ${block.stop} earlier`} onClick={() => revise({ type: 'MOVE_BLOCK', block_id: block.id, direction: -1 })}>↑</button>
                  <button type="button" aria-label={`Move ${block.stop} later`} onClick={() => revise({ type: 'MOVE_BLOCK', block_id: block.id, direction: 1 })}>↓</button>
                </>}
                <label>Days<input aria-label={`${block.stop} days`} type="number" min="1" value={block.days} onChange={event => revise({ type: 'SET_BLOCK_DAYS', block_id: block.id, value: Number(event.target.value) })} /></label>
              </div>
            </header>
            <ul className="plan-list">
              {block.places.map((place, index) => (
                <li className="item-row" key={`${block.id}-${place}`}>
                  <span>{place}</span>
                  <span className="item-actions">
                    <button type="button" aria-label={`Move ${place} up`} onClick={() => revise({ type: 'MOVE_PLACE', block_id: block.id, index, direction: -1 })}>↑</button>
                    <button type="button" aria-label={`Move ${place} down`} onClick={() => revise({ type: 'MOVE_PLACE', block_id: block.id, index, direction: 1 })}>↓</button>
                    <button type="button" aria-label={`Remove ${place}`} onClick={() => revise({ type: 'REMOVE_PLACE', block_id: block.id, index })}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="add-place-row">
              <input aria-label={`Add place to ${block.stop}`} value={newPlaces[block.id] || ''} placeholder="Add a place or broad activity" onChange={event => setNewPlaces(previous => ({ ...previous, [block.id]: event.target.value }))} />
              <button type="button" onClick={() => { revise({ type: 'ADD_PLACE', block_id: block.id, value: newPlaces[block.id] }); setNewPlaces(previous => ({ ...previous, [block.id]: '' })); }}>Add</button>
            </div>
            {block.suggestion && !block.places.includes(block.suggestion.name) && (
              <div className="reasoned-suggestion"><span><strong>Guide suggests {block.suggestion.name}</strong> — {block.suggestion.reason}</span><button type="button" onClick={() => revise({ type: 'ADD_PLACE', block_id: block.id, value: block.suggestion.name })}>Add suggestion</button></div>
            )}
          </article>
        ))}
      </section>

      <footer className="builder-footer">
        <button type="button" className="btn btn-ghost" disabled={!plan.history.length} onClick={() => revise({ type: 'UNDO' })}>Undo last change</button>
        <button type="button" className="btn btn-primary" onClick={generate}>Generate detailed itinerary →</button>
      </footer>
      <small>Fixture-backed Guide revisions — no Backend or agent call was made.</small>
    </main>
  );
}
