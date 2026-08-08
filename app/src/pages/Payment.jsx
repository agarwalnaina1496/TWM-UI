import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/auth.css';

export default function Payment() {
  const navigate = useNavigate();
  const { updateTrip } = useTrip();
  const [processing, setProcessing] = useState(false);

  function pay() {
    setProcessing(true);
    setTimeout(() => {
      updateTrip({ paid: true });
      navigate('/logistics');
    }, 1200);
  }

  return (
    <div className="wrap">
      <span className="eyebrow">Simulated payment — prototype only</span>
      <h1>Get your <em>detailed itinerary</em></h1>
      <p className="lede">Illustrative amount, not a real charge. This screen exists to show where payment sits in the flow.</p>

      <div className="auth-card">
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 600, marginBottom: 4 }}>₹499</div>
        <div style={{ fontSize: 12, color: 'var(--tm)', marginBottom: 20 }}>One-time · illustrative</div>
        <span className={`btn btn-primary btn-full${processing ? ' disabled' : ''}`} onClick={processing ? undefined : pay}>
          {processing ? 'Processing…' : 'Pay (simulated) →'}
        </span>
        <p style={{ fontSize: 11, color: 'var(--tm)', textAlign: 'center', marginTop: 10 }}>No real payment provider is connected in this prototype.</p>
      </div>
    </div>
  );
}
