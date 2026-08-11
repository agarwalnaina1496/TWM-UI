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
        <article className="plan-card"><div className="plan-name">Self-Led</div><div className="plan-promise">You stay in control. We do the homework.</div><ul className="plan-feats"><li>Destination discovery, if you haven't picked one</li><li>Personalized day-by-day itinerary</li><li>2–3 curated flight, hotel &amp; activity options with reasoning</li><li>Deep links straight to checkout</li></ul><div className="plan-you-handle">You handle: booking, payment and on-trip changes.</div><button type="button" className="btn btn-primary btn-full" onClick={chooseSelfLed}>Choose Self-Led →</button></article>
        <article className="plan-card hi" aria-disabled="true"><div className="plan-name">TWM-Led <span className="chip">Coming Soon</span></div><div className="plan-promise">You enjoy the trip. We handle the rest.</div><ul className="plan-feats"><li>Everything in Self-Led, plus:</li><li>End-to-end booking coordination</li><li>Pickup, drop &amp; daily coordination</li><li>Disruptions handled directly</li><li>One point of contact for the whole trip</li></ul><button type="button" className="btn btn-primary btn-full" disabled>Choose TWM-Led →</button></article>
      </div>
    </main>
  );
}
