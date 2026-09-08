import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { useTrip } from '../context/TripContext.jsx';
import { trackEvent } from '../lib/analytics.js';
import '../styles/auth.css';

// TWM-219: the TWM-Led quote-request flow is a pre-MVP stub. Trip details
// come from the composed read model (context_recap + summary) when a trip
// is open, or a single honest line otherwise — there is no structured
// trip-date display anywhere to show.
function tripDetailLines(view) {
  if (!view) return ['Your coordinator will confirm trip details with you.'];
  const recap = new Map((view.context_recap || []).map(item => [item.key, item.value]));
  const lines = [];
  const headline = [
    recap.get('destinations') || 'Destination TBD',
    recap.get('trip_duration') && `${recap.get('trip_duration')} days`,
    view.summary?.travelers?.value || recap.get('num_travelers'),
  ].filter(Boolean).join(' · ');
  if (headline) lines.push(headline);
  if (recap.get('origin_city')) lines.push(`From ${recap.get('origin_city')}`);
  if (recap.get('budget')) lines.push(`Budget: ${recap.get('budget')}`);
  return lines.length ? lines : ['Your coordinator will confirm trip details with you.'];
}

export default function RequestQuote() {
  const { commandSnapshot: view, auth, setContact } = useTrip();
  const [name, setName] = useState(auth.name);
  const [email, setEmail] = useState(auth.email);
  const [sent, setSent] = useState(false);

  function submit() {
    setContact({ name: name.trim() || 'Traveler', email: email.trim() });
    trackEvent('booking_intent', { booking_type: 'quote_request' });
    setSent(true);
  }

  return (
    <Layout>
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
              {tripDetailLines(view).map(line => (
                <div className="field-hint" key={line}>{line}</div>
              ))}
            </div>

            <span className="btn btn-primary btn-full" onClick={submit}>Request a quote →</span>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, marginBottom: 6 }}>Request sent</div>
            <p className="lede">Someone from the TravelWithMe team will reach out within 24 hours with a quote for this trip.</p>
          </>
        )}
      </div>
    </Layout>
  );
}
