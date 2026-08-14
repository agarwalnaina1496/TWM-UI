import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import ContextualAuthModal from '../components/ContextualAuthModal.jsx';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { trackEvent } from '../lib/analytics.js';
import {
  isTripEmpty, isItineraryReady, isCompletedTrip, stageBadge, stageCta, contextRecapPills, contextDestination,
} from '../lib/tripLifecycle.js';
import '../styles/dashboard-home.css';

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
  const [filter, setFilter] = useState('all');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newTripMenuOpen, setNewTripMenuOpen] = useState(false);
  const newTripMenuRef = useRef(null);

  // Closes the "+ New trip" dropdown on an outside click — a plain toggle
  // button would otherwise leave it open until another explicit choice.
  useEffect(() => {
    if (!newTripMenuOpen) return;
    function onClickOutside(event) {
      if (!newTripMenuRef.current?.contains(event.target)) setNewTripMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [newTripMenuOpen]);

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

  // Mirrors the header nav's "Plan a Trip" / "Discover Destination" actions
  // (TWM-164) — the empty state offers the same two entry paths inline
  // rather than a separate "+ New trip" button.
  function handlePlanTrip() {
    trackEvent('intent_selected', { intent: 'plan' });
    startNewTrip();
    setNewTripMenuOpen(false);
    navigate(`/journey-entry?intent=${ENTRY_INTENTS.KNOWN_DESTINATION}`);
  }

  function handleDiscover() {
    trackEvent('intent_selected', { intent: 'discover' });
    startNewTrip();
    setNewTripMenuOpen(false);
    navigate(`/journey-entry?intent=${ENTRY_INTENTS.DISCOVER}`);
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

  return (
    <div className="wrap">
      <div className="my-trips-header">
        <div className="my-trips-header-left">
          <h1>Your <em>trips</em></h1>
          {visibleTrips.length > 0 && (
            <div className="new-trip-menu" ref={newTripMenuRef}>
              <button type="button" className="btn btn-ghost" onClick={() => setNewTripMenuOpen(open => !open)}>+ New trip</button>
              {newTripMenuOpen && (
                <div className="new-trip-menu-dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={handlePlanTrip}>📍 Plan a Trip</button>
                  <button type="button" role="menuitem" onClick={handleDiscover}>🧭 Discover Destination</button>
                </div>
              )}
            </div>
          )}
        </div>
        {auth.loggedIn ? (
          <span className="account-status">Signed in as {auth.name}</span>
        ) : (
          <span className="account-status">
            You're browsing as a guest.<br />
            <span className="auth-invite-link" onClick={() => setSyncInviteOpen(true)}>Log in to sync across devices</span>
          </span>
        )}
      </div>

      <ContextualAuthModal
        open={syncInviteOpen}
        onClose={() => setSyncInviteOpen(false)}
        benefit="Log in to sync this trip across devices"
        guestNote="Your current trip stays available on this device either way."
      />

      {notice && <div className="price-evidence state-unsafe" role="alert">{notice}</div>}

      {visibleTrips.length === 0 ? (
        <div className="empty-trips">
          <p className="empty-trips-title">No trips yet</p>
          <p>Start planning your next adventure.</p>
          <div className="empty-trips-actions">
            <div className="entry-card" onClick={handlePlanTrip}>
              <div className="entry-card-icon">📍</div>
              <div className="entry-card-t">Plan a Trip</div>
              <div className="entry-card-s">Already know your destination.</div>
            </div>
            <div className="entry-card" onClick={handleDiscover}>
              <div className="entry-card-icon">🧭</div>
              <div className="entry-card-t">Discover Destination</div>
              <div className="entry-card-s">Get suggestions based on your vibe.</div>
            </div>
          </div>
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
