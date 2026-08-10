import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/choose-plan.css';

export default function ChoosePlan() {
  const navigate = useNavigate();
  const { trip, updateTrip } = useTrip();
  function chooseSelfLed() {
    updateTrip({ plan: 'self-led', atlasState: { ...trip.atlasState, mode: 'self-led' } });
    navigate('/dashboard');
  }
  return (
    <main className="wrap">
      <span className="eyebrow">Choose who handles booking and on-trip execution</span>
      <h1>Your itinerary is ready. <em>How should the trip run?</em></h1>
      <p className="lede">This choice changes who books, uploads confirmations and handles the trip—not the itinerary you just reviewed.</p>
      <div className="plan-grid">
        <article className="plan-card"><div className="plan-name">Self-Led</div><div className="plan-promise">You book and manage. We keep everything organized.</div><ul className="plan-feats"><li>Days, transport, stays, bookings and map in one Dashboard</li><li>Traveler-owned provider handoff and confirmation upload</li><li>Reviewed itinerary changes when bookings affect the plan</li><li>Self-managed on-trip execution</li></ul><button type="button" className="btn btn-primary btn-full" onClick={chooseSelfLed}>Open my Self-Led Dashboard →</button></article>
        <article className="plan-card hi" aria-disabled="true"><div className="plan-name">TWM-Led <span className="chip">Coming Soon</span></div><div className="plan-promise">TWM books, coordinates and supports the trip.</div><ul className="plan-feats"><li>TWM-managed booking and confirmations</li><li>Status, documents and support in your Dashboard</li><li>No traveler booking or upload required</li><li>Travel-agent-style on-trip coordination</li></ul><button type="button" className="btn btn-primary btn-full" disabled>TWM-Led is Coming Soon</button></article>
      </div>
      <p className="plan-illustrative">No payment or reservation happens in this prototype.</p>
    </main>
  );
}
