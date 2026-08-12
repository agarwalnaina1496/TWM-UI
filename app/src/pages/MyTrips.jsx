import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import ContextualAuthModal from '../components/ContextualAuthModal.jsx';
import { isTripEmpty, isItineraryReady, isCompletedTrip, stageBadge, stageCta } from '../lib/tripLifecycle.js';
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

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

export default function MyTrips() {
  const { trips, auth, startNewTrip, openTrip, renameTrip } = useTrip();
  const navigate = useNavigate();
  const [syncInviteOpen, setSyncInviteOpen] = useState(false);
  const [syncDismissed, setSyncDismissed] = useState(readSyncDismissed);
  const [filter, setFilter] = useState('all');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  // Fresh, no-progress trips (e.g. the record TripContext auto-creates)
  // aren't real trips from the traveler's point of view — TWM-108 keeps
  // them out of My Trips entirely, same as the landing resolver.
  const visibleTrips = trips.filter(t => !isTripEmpty(t.trip_state));
  const completedTrips = visibleTrips.filter(t => isCompletedTrip(t.trip_state));
  const upcomingTrips = visibleTrips.filter(t => isItineraryReady(t.trip_state) && !isCompletedTrip(t.trip_state));
  const activeTrips = visibleTrips.filter(t => !isItineraryReady(t.trip_state) && !isCompletedTrip(t.trip_state));

  const groups = { all: visibleTrips, active: activeTrips, upcoming: upcomingTrips, completed: completedTrips };
  const counts = { all: visibleTrips.length, active: activeTrips.length, upcoming: upcomingTrips.length, completed: completedTrips.length };
  const shown = groups[filter] ?? visibleTrips;

  async function handleNewTrip() {
    await startNewTrip();
    navigate('/');
  }

  // TWM-109: opening a trip that turned out to be gone (deleted, or a stale
  // card from another session) fails closed — the context already dropped
  // it from `trips`, so the card disappears and we just surface why instead
  // of navigating into a dead trip.
  async function handleOpen(t) {
    if (busyId) return;
    setBusyId(t.id);
    setNotice(null);
    try {
      const result = await openTrip(t.id);
      if (!result.ok) {
        setNotice('This trip is no longer available.');
        return;
      }
      navigate(stageCta(t.trip_state).to);
    } finally {
      setBusyId(null);
    }
  }

  function startRename(t) {
    setRenamingId(t.id);
    setRenameValue(t.title || '');
    setNotice(null);
  }

  async function commitRename(id) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      const result = await renameTrip(id, title);
      if (!result.ok) setNotice('This trip is no longer available.');
    } catch {
      // Rename failures leave the prior title in place — no local state to roll back.
    }
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
        {visibleTrips.length > 0 && (
          <span className="btn btn-primary" onClick={handleNewTrip}>+ New trip</span>
        )}
      </div>
      {auth.loggedIn ? (
        <p className="lede">Signed in as {auth.name}.</p>
      ) : (
        <p className="lede">You're browsing as a guest — trips here are saved for this session.</p>
      )}

      {!auth.loggedIn && (
        <div className="account-history-locked">
          <p>Trip history from other devices or a previous account isn't available as a guest.</p>
          {!syncDismissed && (
            <span className="auth-invite-link" onClick={() => setSyncInviteOpen(true)}>Log in to sync across devices</span>
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

      {notice && <div className="price-evidence state-unsafe" role="alert">{notice}</div>}

      {visibleTrips.length === 0 ? (
        <div className="empty-trips">
          <p>Nothing saved yet.</p>
          {/* No trip exists yet here, so this must not eagerly create one via
              startNewTrip (unlike "+ New trip" above, a deliberate action
              against an existing list) — it just sends the traveler to
              GetStarted, where the Backend trip is created lazily on their
              first message. */}
          <Link className="btn btn-primary" style={{ marginTop: 12, display: 'inline-flex' }} to="/">Start a trip →</Link>
        </div>
      ) : (
        <>
          <div className="filter-bar" role="tablist" aria-label="Filter trips">
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`fc${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}{counts[f.key] ? ` (${counts[f.key]})` : ''}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="empty-trips"><p>No trips here yet.</p></div>
          ) : (
            shown.map(t => {
              const badge = stageBadge(t.trip_state);
              const cta = stageCta(t.trip_state);
              return (
                <div className="trip-card" key={t.id}>
                  <div>
                    {renamingId === t.id ? (
                      <input
                        className="name"
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(t.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                    ) : (
                      <div className="name">
                        {t.title || 'Untitled trip'}{' '}
                        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => startRename(t)}>
                          Rename
                        </button>
                      </div>
                    )}
                    <div className="meta">
                      <span className="badge">{badge.text}</span>
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost" disabled={busyId === t.id} onClick={() => handleOpen(t)}>
                    {cta.label} →
                  </button>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
