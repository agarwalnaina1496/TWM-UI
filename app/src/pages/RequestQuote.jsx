import { useState } from 'react';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/auth.css';

const BUDGET_LABELS = {
  budget: 'Under ₹30,000', mid: '₹30,000–70,000', premium: '₹70,000+', flexible: 'Flexible budget',
};

function formatDateRange(start, end) {
  if (!start) return '';
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const s = new Date(start).toLocaleDateString('en-IN', opts);
  if (!end || end === start) return s;
  const e = new Date(end).toLocaleDateString('en-IN', opts);
  return `${s} – ${e}`;
}

export default function RequestQuote() {
  const { trip, auth, setContact } = useTrip();
  const [name, setName] = useState(auth.name);
  const [email, setEmail] = useState(auth.email);
  const [sent, setSent] = useState(false);

  function submit() {
    setContact({ name: name.trim() || 'Traveler', email: email.trim() });
    setSent(true);
  }

  return (
    <div className="wrap">
      <h1>Request a <em>quote</em></h1>
      <p className="lede" style={{ maxWidth: 'none', whiteSpace: 'nowrap' }}>TWM-Led pricing depends on your dates and group size, so a coordinator follows up directly rather than an instant charge here.</p>

      <div className="auth-card">
        {!sent ? (
          <>
            <div className="field-block">
              <div className="field-title">Name</div>
              <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="field-block">
              <div className="field-title">Email</div>
              <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
            </div>

            <div className="field-block">
              <div className="field-title">Trip details</div>
              <div className="field-hint">
                {trip.destination?.name || 'Destination TBD'} · {trip.days.length || trip.tripLength} days · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}
              </div>
              {trip.origin && <div className="field-hint">From {trip.origin}</div>}
              <div className="field-hint">Budget: {BUDGET_LABELS[trip.budget] || 'Flexible budget'}</div>
              {(trip.departDate || (trip.month && trip.month !== 'flexible')) && (
                <div className="field-hint">
                  {trip.departDate ? formatDateRange(trip.departDate, trip.returnDate) : trip.month}
                </div>
              )}
              {trip.style && <div className="field-hint">Goal: "{trip.style}"</div>}
            </div>

            <span className="btn btn-primary btn-full" onClick={submit}>Request a quote (simulated) →</span>
            <p style={{ fontSize: 11, color: 'var(--tm)', textAlign: 'center', marginTop: 10 }}>Prototype — no request is actually sent to a coordinator.</p>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, marginBottom: 6 }}>Request sent (simulated)</div>
            <p className="lede">Someone from the TravelWithMe team will reach out within 24 hours with a quote for this trip.</p>
          </>
        )}
      </div>
    </div>
  );
}
