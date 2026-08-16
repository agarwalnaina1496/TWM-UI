import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import ContextualAuthModal from '../components/ContextualAuthModal.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { trackEvent } from '../lib/analytics.js';
import {
  isTripEmpty, isCompletedTrip, stageBadge, stageCta, contextRecapPills, contextDestination,
} from '../lib/tripLifecycle.js';
import { isDiscoverOnly, selectHeroTrip } from '../lib/tripHero.js';
import '../styles/dashboard-home.css';

const BADGE_TONE = { 'b-new': 'neutral', 'b-chat': 'caution', 'b-reco': 'caution', 'b-matched': 'caution', 'b-done': 'positive' };

// updated_at is set on every mutation, but a never-touched-since-creation
// trip can still have it null — fall back to created_at rather than show nothing.
function formatTripTimestamp(t) {
  const raw = t.updated_at || t.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function matchesSearch(t, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const destination = contextDestination(t.trip_state?.trip_context) || '';
  return (t.title || 'Untitled trip').toLowerCase().includes(q) || destination.toLowerCase().includes(q);
}

// Dashboard-as-home (TWM-163): the product's home surface once a traveler
// has any trips, mounted directly at both `/` and `/my-trips`. Distinct from
// TripDashboard.jsx, the per-trip itinerary/booking view a card here links
// into — naming kept separate so the two are never confused.
//
// TWM-172: two states. True empty (no trips at all) shows only the two entry
// doors — no list, no search. Returning shows a date-priority hero, a
// lighter "Continue exploring" rail for discover-only sessions, a search
// scoped to the traveler's own trips, the regular committed-trips list, and
// a quiet past-trips section. The prior filter tabs (all/active/upcoming/
// completed) are intentionally dropped, not an oversight — upcoming is now
// a subset of the regular list and completed has its own section, so a
// separate filter no longer adds anything the new structure doesn't already
// split out.
export default function DashboardHome() {
  const { trips, auth, startNewTrip, openTrip, renameTrip } = useTrip();
  const navigate = useNavigate();
  const [syncInviteOpen, setSyncInviteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newTripMenuOpen, setNewTripMenuOpen] = useState(false);
  const newTripMenuRef = useRef(null);
  const trackedHero = useRef(null);

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
  const discoverOnlyTrips = visibleTrips.filter(t => !isCompletedTrip(t.trip_state) && isDiscoverOnly(t.trip_state));
  const committedTrips = visibleTrips.filter(t => !isCompletedTrip(t.trip_state) && !isDiscoverOnly(t.trip_state));

  const hero = useMemo(() => selectHeroTrip(committedTrips), [committedTrips]);
  const listTrips = committedTrips.filter(t => t.id !== hero?.id);

  const searching = search.trim().length > 0;
  const searchResults = searching ? visibleTrips.filter(t => matchesSearch(t, search)) : [];

  useEffect(() => {
    if (!hero || trackedHero.current === hero.id) return;
    trackedHero.current = hero.id;
    trackEvent('hero_trip_shown', { stage: hero.trip_state?.stage ?? 'new' });
  }, [hero]);

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
  async function handleOpen(t, { to = '/dashboard' } = {}) {
    if (busyId) return;
    setBusyId(t.id);
    setNotice(null);
    try {
      const result = await openTrip(t.id);
      if (!result.ok) {
        setNotice('This trip is no longer available.');
        return;
      }
      navigate(to);
    } finally {
      setBusyId(null);
    }
  }

  function handleExploreRailOpen(t) {
    trackEvent('explore_rail_engaged', { stage: t.trip_state?.stage ?? 'new' });
    handleOpen(t, { to: stageCta(t.trip_state).to });
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

  // TWM-171: exactly one primary affordance per committed trip card, fixed
  // label regardless of stage — stage is communicated via the adjacent
  // status tag, not this button's text.
  function TripCard({ t, showRename = true }) {
    const badge = stageBadge(t.trip_state);
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
              {showRename && (
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => startRename(t)}>
                  Rename
                </button>
              )}
            </div>
          )}
          {destination && <div className="trip-card-destination">{destination}</div>}
          <div className="meta">
            <StatusPill tone={BADGE_TONE[badge.cls] || 'neutral'}>{badge.text}</StatusPill>
            {timestamp && <span className="trip-card-timestamp">{timestamp}</span>}
          </div>
          {recapPills.length > 0 && (
            <div className="trip-card-recap">
              {recapPills.map(pill => <span key={pill} className="trip-card-recap-pill">{pill}</span>)}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-ghost" disabled={busyId === t.id} onClick={() => handleOpen(t)}>
          Open trip →
        </button>
      </div>
    );
  }

  function ExploreRailCard({ t }) {
    const cta = stageCta(t.trip_state);
    const badge = stageBadge(t.trip_state);
    const recapPills = contextRecapPills(t.trip_state?.trip_context);
    return (
      <div className="explore-card" key={t.id}>
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
        <StatusPill tone={BADGE_TONE[badge.cls] || 'neutral'}>{badge.text}</StatusPill>
        {recapPills.length > 0 ? (
          <div className="trip-card-recap">
            {recapPills.map(pill => <span key={pill} className="trip-card-recap-pill">{pill}</span>)}
          </div>
        ) : (
          <p className="explore-card-empty">Just getting started.</p>
        )}
        <button type="button" className="btn btn-ghost" disabled={busyId === t.id} onClick={() => handleExploreRailOpen(t)}>
          {cta.label}
        </button>
      </div>
    );
  }

  const trueEmpty = visibleTrips.length === 0;

  return (
    <div className="wrap">
      <div className="my-trips-header">
        <h1>Your <em>trips</em></h1>
        {auth.loggedIn ? (
          <span className="account-status">Signed in as {auth.name}</span>
        ) : (
          <span className="account-status">
            You're browsing as a guest.<br />
            <span className="auth-invite-link" onClick={() => setSyncInviteOpen(true)}>Log in so you don't lose this</span>
          </span>
        )}
      </div>

      <ContextualAuthModal
        open={syncInviteOpen}
        onClose={() => setSyncInviteOpen(false)}
        benefit="Log in so you don't lose this trip"
        guestNote="Your current trip stays available on this device either way."
      />

      {notice && <div className="price-evidence state-unsafe" role="alert">{notice}</div>}

      {trueEmpty ? (
        <div className="empty-trips">
          <p className="empty-trips-title">No trips yet</p>
          <p>Start planning your next adventure.</p>
          <div className="empty-trips-actions">
            <div className="entry-card" onClick={handlePlanTrip}>
              <div className="entry-card-icon">📍</div>
              <div className="entry-card-t">Know where you're going?</div>
              <div className="entry-card-s">Already know your destination.</div>
            </div>
            <div className="entry-card" onClick={handleDiscover}>
              <div className="entry-card-icon">🧭</div>
              <div className="entry-card-t">Still deciding?</div>
              <div className="entry-card-s">Get suggestions based on your vibe.</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="filter-row">
            <input
              type="search"
              className="trip-search"
              placeholder="Search your trips…"
              aria-label="Search your trips"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="new-trip-menu" ref={newTripMenuRef}>
              <button type="button" className="btn btn-primary" onClick={() => setNewTripMenuOpen(open => !open)}>+ New trip</button>
              {newTripMenuOpen && (
                <div className="new-trip-menu-dropdown" role="menu">
                  <button type="button" role="menuitem" onClick={handlePlanTrip}>📍 Plan a Trip</button>
                  <button type="button" role="menuitem" onClick={handleDiscover}>🧭 Discover Destination</button>
                </div>
              )}
            </div>
          </div>

          {searching ? (
            searchResults.length === 0 ? (
              <div className="empty-trips"><p>No trips match "{search.trim()}".</p></div>
            ) : (
              searchResults.map(t => <TripCard key={t.id} t={t} />)
            )
          ) : (
            <>
              {hero && (
                <section className="hero-trip" aria-label="Your most urgent trip">
                  <TripCard t={hero} />
                </section>
              )}

              {discoverOnlyTrips.length > 0 && (
                <section className="explore-rail" aria-label="Continue exploring">
                  <h2 className="section-title">Continue exploring</h2>
                  <div className="explore-rail-row">
                    {discoverOnlyTrips.map(t => <ExploreRailCard key={t.id} t={t} />)}
                  </div>
                </section>
              )}

              {listTrips.map(t => <TripCard key={t.id} t={t} />)}

              {listTrips.length === 0 && !hero && discoverOnlyTrips.length === 0 && completedTrips.length === 0 && (
                <div className="empty-trips"><p>No trips here yet.</p></div>
              )}

              {completedTrips.length > 0 && (
                <section className="past-trips" aria-label="Past trips">
                  <h2 className="section-title">Past trips</h2>
                  {completedTrips.map(t => <TripCard key={t.id} t={t} showRename={false} />)}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
