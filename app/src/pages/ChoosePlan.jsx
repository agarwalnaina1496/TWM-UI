import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/choose-plan.css';

export default function ChoosePlan() {
  const navigate = useNavigate();
  const { updateTrip } = useTrip();

  function choose(plan) {
    updateTrip({ plan });
    // Login + payment temporarily skipped for both paths — pages stay intact, just bypassed in navigation for now.
    navigate(plan === 'self-led' ? '/logistics' : '/request-quote');
  }

  return (
    <div className="wrap">
      <span className="eyebrow">How do you want to take it from here?</span>
      <h1>Same control. <em>Different</em> amount of work.</h1>
      <p className="lede">Book and manage the trip yourself, or let us handle it for you. Either way, the plan you just built stays exactly as is.</p>

      <div className="plan-grid">
        <div className="plan-card">
          <div className="plan-name">Self-Led</div>
          <div className="plan-promise">You stay in control. We do the homework.</div>
          <ul className="plan-feats">
            <li>Your finalized itinerary, day by day</li>
            <li>Booking links for flights, hotels & activities</li>
            <li>Budget breakdown</li>
            <li>Downloadable PDF</li>
          </ul>
          <span className="btn btn-primary btn-full" onClick={() => choose('self-led')}>Get my itinerary →</span>
        </div>

        <div className="plan-card hi">
          <div className="plan-name">TWM-Led</div>
          <div className="plan-promise">You enjoy the trip. We handle the rest.</div>
          <ul className="plan-feats">
            <li>Everything in Self-Led, plus:</li>
            <li>End-to-end booking coordination</li>
            <li>Pickup, drop & daily coordination</li>
            <li>One point of contact for the whole trip</li>
          </ul>
          <span className="btn btn-primary btn-full" onClick={() => choose('twm-led')}>Request a quote →</span>
        </div>
      </div>
      <p className="plan-illustrative">Illustrative — this is a prototype, nothing here is a real charge.</p>
    </div>
  );
}
