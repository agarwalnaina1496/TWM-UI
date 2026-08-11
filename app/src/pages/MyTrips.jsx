import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import ContextualAuthModal from '../components/ContextualAuthModal.jsx';
import '../styles/my-trips.css';

// TWM-140: once dismissed for this browsing session, don't re-offer the
// sync invitation on every My Trips visit.
const SYNC_DISMISSED_KEY = 'twm_sync_invite_dismissed';

function readSyncDismissed() {
  try {
    return sessionStorage.getItem(SYNC_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function MyTrips() {
  const { savedTrips, auth, startNewTrip } = useTrip();
  const navigate = useNavigate();
  const [syncInviteOpen, setSyncInviteOpen] = useState(false);
  const [syncDismissed, setSyncDismissed] = useState(readSyncDismissed);

  function handleNewTrip() {
    startNewTrip();
    navigate('/');
  }

  function handleSyncDismiss() {
    try {
      sessionStorage.setItem(SYNC_DISMISSED_KEY, '1');
    } catch {
      // sessionStorage unavailable — worst case the invite can be reopened this session.
    }
    setSyncDismissed(true);
  }

  return (
    <div className="wrap">
      <div className="my-trips-header">
        <h1>Your <em>trips</em></h1>
        {savedTrips.length > 0 && (
          <span className="btn btn-primary" onClick={handleNewTrip}>+ New trip</span>
        )}
      </div>
      {auth.loggedIn ? (
        <p className="lede">Signed in as {auth.name}.</p>
      ) : (
        <p className="lede">
          You're browsing as a guest — trips here are saved for this session.{' '}
          <span className="auth-invite-link" onClick={() => setSyncInviteOpen(true)}>Log in to sync across devices</span>
        </p>
      )}

      {!auth.loggedIn && (
        <div className="account-history-locked">
          <p>Trip history from other devices or a previous account isn't available as a guest.</p>
          {!syncDismissed && (
            <span className="auth-invite-link" onClick={() => setSyncInviteOpen(true)}>Log in to see synced trip history</span>
          )}
        </div>
      )}

      <ContextualAuthModal
        open={syncInviteOpen}
        onClose={() => setSyncInviteOpen(false)}
        benefit="Log in to sync this trip across devices"
        guestNote="Your current trip stays available on this device either way."
        onContinueWithoutLogin={handleSyncDismiss}
      />

      {savedTrips.length === 0 ? (
        <div className="empty-trips">
          <p>Nothing saved yet.</p>
          <Link className="btn btn-primary" to="/" style={{ marginTop: 12, display: 'inline-flex' }}>Start a trip →</Link>
        </div>
      ) : (
        savedTrips.map(t => (
          <div className="trip-card" key={t.destination?.name}>
            <div>
              <div className="name">{t.destination?.name || 'Untitled trip'}</div>
              <div className="meta">{t.days.length} days · {t.plan === 'twm-led' ? 'TWM-Led' : t.plan === 'self-led' ? 'Self-Led' : 'Planning'}{t.paid ? ' · Itinerary ready' : ''}</div>
            </div>
            {t.paid ? <Link className="btn btn-ghost" to="/itinerary">View →</Link> : <Link className="btn btn-ghost" to="/trip-preview">Continue →</Link>}
          </div>
        ))
      )}
    </div>
  );
}
