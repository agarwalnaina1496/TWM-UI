import { useTrip } from '../context/TripContext.jsx';
import '../styles/itinerary.css';

export default function Itinerary() {
  const { trip } = useTrip();

  return (
    <div className="wrap">
      <span className="eyebrow">Fixture-backed preview — not a live Atlas result</span>
      <h1>Your <em>{trip.destination || 'trip'}</em> itinerary</h1>

      <div className="itin-banner">
        <div className="t1">{trip.days.length} days · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}</div>
        <div className="t2">Also would be sent to your WhatsApp in the real product.</div>
      </div>

      <div className="itin-actions">
        <span className="btn btn-ghost" onClick={() => alert('Prototype — PDF generation is simulated, per TWM-98.')}>Download PDF (simulated)</span>
        <span className="btn btn-ghost" onClick={() => alert('Prototype — sharing is simulated.')}>Share</span>
      </div>

      <div className="why-box">
        Built for {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}, within a {trip.budget} budget{trip.style ? ` — aiming for "${trip.style}"` : ''} — every place below came from the plan you approved.
      </div>

      {trip.days.map(d => (
        <div className="itin-day" key={d.day}>
          <div className="itin-day-title">Day {d.day} — {d.title}</div>
          {d.items.map((item, i) => (
            <div className="itin-row" key={item.id}>
              <div className="time">{['9:00 AM', '1:00 PM', '6:00 PM'][i] || '—'}</div>
              <div>{item.text} <a className="link" href="#" onClick={e => { e.preventDefault(); alert('Prototype — this would deep-link to a real booking partner.'); }}>Check availability →</a></div>
            </div>
          ))}
        </div>
      ))}

      <div className="itin-day">
        <div className="itin-day-title">Budget summary</div>
        <div className="budget-row"><span>Stays & activities</span><span>₹18k–24k</span></div>
        <div className="budget-row"><span>Local transport</span><span>₹4k–6k</span></div>
        <div className="budget-row"><span>Meals</span><span>₹5k–7k</span></div>
        <div className="budget-row"><span>Estimated total</span><span>₹27k–37k</span></div>
      </div>

      <div className="auth-card" style={{ marginTop: 24 }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, marginBottom: 6 }}>Questions or changes?</div>
        <p className="lede" style={{ marginBottom: 14 }}>This is for support on the plan you already have — not booking.</p>
        <span className="btn btn-ghost btn-full" onClick={() => alert('Prototype — this would open a support contact flow.')}>Talk to the TravelWithMe team</span>
      </div>
    </div>
  );
}
