import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import ContextualAuthModal from '../components/ContextualAuthModal.jsx';
import {
  isTripEmpty, isItineraryReady, isCompletedTrip, stageBadge, stageCta, contextRecapPills, contextDestination,
} from '../lib/tripLifecycle.js';
import '../styles/dashboard-home.css';

// TWM-140: once dismissed for this browsing session, don't re-offer the
// sync invitation on every Dashboard-home visit.
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

// updated_at is set on every mutation, but a never-touched-since-creation
// trip can still have it null — fall back to created_at rather than show nothing.
function formatTripTimestamp(t) {
  const raw = t.updated_at || t.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Dashboard-as-home (TWM-163): the product's home surface once a traveler
// has any trips, mounted directly at both `/` and `/my-trips`. Distinct from
// TripDashboard.jsx, the per-trip itinerary/booking view a card here links
// into — naming kept separate so the two are never confused.
export default function DashboardHome() {
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
  // aren't real trips from the traveler's point of view — TWM-108/163 keep
  // them out of Dashboard-home entirely.
  const visibleTrips = trips.filter(t => !isTripEmpty(t.trip_state));
  const completedTrips = visibleTrips.filter(t => isCompletedTrip(t.trip_state));
  const upcomingTrips = visibleTrips.filter(t => isItineraryReady(t.trip_state) && !isCompletedTrip(t.trip_state));
  const activeTrips = visibleTrips.filter(t => !isItineraryReady(t.trip_state) && !isCompletedTrip(t.trip_state));

  const groups = { all: visibleTrips, active: activeTrips, upcoming: upcomingTrips, completed: completedTrips };
  const counts = { all: visibleTrips.length, active: activeTrips.length, upcoming: upcomingTrips.length, completed: completedTrips.length };
  const shown = groups[filter] ?? visibleTrips;

  function handleNewTrip() {
    startNewTrip();
    navigate('/new-trip');
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
        <div className="account-history-locked">
          <p>
            You're browsing as a guest.
            {!syncDismissed && (
              <> <span className="auth-invite-link" onClick={() => setSyncInviteOpen(true)}>Log in to sync across devices</span></>
            )}
          </p>
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
          <p className="empty-trips-title">No trips yet</p>
          <p>Start planning your next adventure.</p>
          <span className="btn btn-primary" style={{ marginTop: 12, display: 'inline-flex' }} onClick={handleNewTrip}>+ New trip</span>
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
              const destination = contextDestination(t.trip_state?.trip_context);
              const recapPills = contextRecapPills(t.trip_state?.trip_context);
              const timestamp = formatTripTimestamp(t);
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
                    {destination && <div className="trip-card-destination">{destination}</div>}
                    <div className="meta">
                      <span className="badge">{badge.text}</span>
                      {timestamp && <span className="trip-card-timestamp">{timestamp}</span>}
                    </div>
                    {recapPills.length > 0 && (
                      <div className="trip-card-recap">
                        {recapPills.map(pill => <span key={pill} className="trip-card-recap-pill">{pill}</span>)}
                      </div>
                    )}
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
