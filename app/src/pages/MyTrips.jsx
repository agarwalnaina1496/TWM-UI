import { Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/my-trips.css';

export default function MyTrips() {
  const { savedTrips, auth } = useTrip();

  return (
    <div className="wrap">
      <h1>Your <em>trips</em></h1>
      <p className="lede">{auth.loggedIn ? `Signed in as ${auth.name}.` : "You're browsing as a guest — trips here only persist on this device for now."}</p>

      {savedTrips.length === 0 ? (
        <div className="empty-trips">
          <p>Nothing saved yet.</p>
          <Link className="btn btn-primary" to="/" style={{ marginTop: 12, display: 'inline-flex' }}>Start a trip →</Link>
        </div>
      ) : (
        savedTrips.map(t => (
          <div className="trip-card" key={t.destination}>
            <div>
              <div className="name">{t.destination || 'Untitled trip'}</div>
              <div className="meta">{t.days.length} days · {t.plan === 'twm-led' ? 'TWM-Led' : t.plan === 'self-led' ? 'Self-Led' : 'Planning'}{t.paid ? ' · Itinerary ready' : ''}</div>
            </div>
            {t.paid ? <Link className="btn btn-ghost" to="/itinerary">View →</Link> : <Link className="btn btn-ghost" to="/trip-preview">Continue →</Link>}
          </div>
        ))
      )}
    </div>
  );
}
