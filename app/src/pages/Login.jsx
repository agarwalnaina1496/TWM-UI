import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/auth.css';
import '../styles/details.css';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { trip, login } = useTrip();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  function continueNext() {
    login({ name: name.trim() || 'Traveler', email: email.trim() });
    navigate(searchParams.get('next') || '/');
  }

  return (
    <div className="wrap">
      <h1>Log in to <em>continue</em></h1>
      <p className="lede">
        {trip.plan === 'twm-led'
          ? "We'll need a way to reach you, since a real person coordinates TWM-Led trips."
          : 'Needed before payment, so your itinerary and receipt are tied to you.'}
      </p>

      <div className="auth-card">
        <div className="field-block">
          <div className="field-title">Name</div>
          <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="field-block">
          <div className="field-title">Email</div>
          <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
        </div>
        <span className="btn btn-primary btn-full" onClick={continueNext}>Continue →</span>
        <p style={{ fontSize: 11, color: 'var(--tm)', textAlign: 'center', marginTop: 10 }}>Prototype — nothing is actually sent or stored.</p>
      </div>
    </div>
  );
}
