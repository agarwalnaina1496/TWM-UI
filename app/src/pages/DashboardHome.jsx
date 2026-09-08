import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useTrip } from '../context/TripContext.jsx';
import { useTripsQuery } from '../hooks/tripQueries.js';
import ContextualAuthModal from '../components/ContextualAuthModal.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { trackEvent } from '../lib/analytics.js';
import {
  isTripEmpty, isCompletedTrip, stageBadge, stageCta, contextRecapPills, contextDestination,
  tripStatusLine, relativeUpdatedAt,
} from '../lib/tripLifecycle.js';
import { isDiscoverOnly, selectHeroTrip } from '../lib/tripHero.js';
import { withTripId } from '../lib/tripUrl.js';
import { decodeHtmlEntities } from '../lib/text.js';
import '../styles/dashboard-home.css';

const BADGE_TONE = { 'b-new': 'neutral', 'b-chat': 'caution', 'b-reco': 'caution', 'b-matched': 'caution', 'b-done': 'positive' };

// updated_at is set on every mutation, but a never-touched-since-creation
// trip can still have it null — fall back to created_at rather than show nothing.
function formatTripTimestamp(t) {
  return relativeUpdatedAt(t.updated_at || t.created_at);
}

function matchesSearch(t, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const destination = contextDestination(t) || '';
  return (t.title || 'Untitled trip').toLowerCase().includes(q) || destination.toLowerCase().includes(q);
}

// TWM-221: hoisted to module scope so a DashboardHome re-render (e.g. a
// background trip prefetch landing) re-renders these in place rather than
// remounting the subtree and dropping an open rename input's focus/value.
function RenameName({ t, rename, showRename = true, label }) {
  if (rename.id === t.id) {
    return (
      <input
        className="name"
        autoFocus
        value={rename.value}
        onChange={e => rename.setValue(e.target.value)}
        onBlur={() => rename.commit(t.id)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') rename.cancel();
        }}
      />
    );
  }
  return (
    <div className="name">
      {label || 'Untitled trip'}{' '}
      {showRename && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => rename.start(t)}>
          Rename
        </button>
      )}
    </div>
  );
}

// TWM-171: exactly one primary affordance per committed trip card, fixed
// label regardless of stage — stage is communicated via the adjacent status
// tag, not this button's text.
function TripCard({ t, rename, busyId, onOpen, showRename = true }) {
  const badge = stageBadge(t);
  const destination = contextDestination(t);
  const recapPills = contextRecapPills(t);
  const timestamp = formatTripTimestamp(t);
  const statusLine = tripStatusLine(t);
  return (
    <div className="trip-card">
      <div>
        <RenameName t={t} rename={rename} showRename={showRename} label={decodeHtmlEntities(t.title)} />
        {destination && <div className="trip-card-destination">{destination}</div>}
        <div className="meta">
          <StatusPill tone={BADGE_TONE[badge.cls] || 'neutral'}>{badge.text}</StatusPill>
          {timestamp && <span className="trip-card-timestamp">{timestamp}</span>}
        </div>
        {statusLine && <p className="trip-card-status-line">{statusLine}</p>}
        {recapPills.length > 0 && (
          <div className="trip-card-recap">
            {recapPills.map(pill => <span key={pill} className="trip-card-recap-pill">{pill}</span>)}
          </div>
        )}
      </div>
      <button type="button" className="btn btn-ghost" disabled={busyId === t.id} onClick={() => onOpen(t)}>
        Open trip →
      </button>
    </div>
  );
}

function ExploreRailCard({ t, rename, busyId, onOpen }) {
  const cta = stageCta(t);
  const badge = stageBadge(t);
  const recapPills = contextRecapPills(t);
  const statusLine = tripStatusLine(t);
  return (
    <div className="explore-card">
      <RenameName t={t} rename={rename} label={t.title} />
      <StatusPill tone={BADGE_TONE[badge.cls] || 'neutral'}>{badge.text}</StatusPill>
      {statusLine && <p className="explore-card-status-line">{statusLine}</p>}
      {recapPills.length > 0 && (
        <div className="trip-card-recap">
          {recapPills.map(pill => <span key={pill} className="trip-card-recap-pill">{pill}</span>)}
        </div>
      )}
      <button type="button" className="btn btn-ghost" disabled={busyId === t.id} onClick={() => onOpen(t)}>
        {cta.label}
      </button>
    </div>
  );
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
  const { auth, startNewTrip, prefetchTrip, renameTrip } = useTrip();
  const tripsQuery = useTripsQuery();
  const trips = tripsQuery.data ?? [];
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
  const visibleTrips = trips.filter(t => !isTripEmpty(t));
  const completedTrips = visibleTrips.filter(t => isCompletedTrip(t));
  const discoverOnlyTrips = visibleTrips.filter(t => !isCompletedTrip(t) && isDiscoverOnly(t));
  const committedTrips = visibleTrips.filter(t => !isCompletedTrip(t) && !isDiscoverOnly(t));

  const hero = useMemo(() => selectHeroTrip(committedTrips), [committedTrips]);
  const listTrips = committedTrips.filter(t => t.id !== hero?.id);

  const searching = search.trim().length > 0;
  const searchResults = searching ? visibleTrips.filter(t => matchesSearch(t, search)) : [];

  useEffect(() => {
    if (!hero || trackedHero.current === hero.id) return;
    trackedHero.current = hero.id;
    trackEvent('hero_trip_shown', { stage: hero.lifecycle?.stage ?? 'new' });
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
  //
  // TWM-221: warms the ['trip', id] cache and points currentTripId at it
  // before navigating; a gone trip (deleted, or a stale card from another
  // session) fails closed — prefetchTrip drops it from the list and we
  // surface why instead of navigating into a dead trip.
  async function handleOpen(t, { to = '/dashboard' } = {}) {
    if (busyId) return;
    setBusyId(t.id);
    setNotice(null);
    try {
      const result = await prefetchTrip(t.id);
      if (!result.ok) {
        setNotice('This trip is no longer available.');
        return;
      }
      navigate(withTripId(to, t.id));
    } finally {
      setBusyId(null);
    }
  }

  function handleExploreRailOpen(t) {
    trackEvent('explore_rail_engaged', { stage: t.lifecycle?.stage ?? 'new' });
    handleOpen(t, { to: stageCta(t).to });
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

  const rename = { id: renamingId, value: renameValue, setValue: setRenameValue, commit: commitRename, start: startRename, cancel: () => setRenamingId(null) };

  // Gated on the list query having actually resolved once — `trips` starts
  // as an empty array before the boot fetch settles, so an unconditional
  // length check would briefly render a real account (and, mid-load, a
  // genuinely empty one) with the settled empty state instead of "Loading".
  const stillLoading = !tripsQuery.isFetched;
  const trueEmpty = tripsQuery.isFetched && visibleTrips.length === 0;

  return (
    <Layout>
      <div className="my-trips-header">
        {!trueEmpty && <h1>Your <em>trips</em></h1>}
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

      {stillLoading ? (
        <div className="empty-trips" aria-busy="true">
          <p>Loading your trips…</p>
        </div>
      ) : trueEmpty ? (
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
              searchResults.map(t => <TripCard key={t.id} t={t} rename={rename} busyId={busyId} onOpen={handleOpen} />)
            )
          ) : (
            <>
              {hero && (
                <section className="hero-trip" aria-label="Your most urgent trip">
                  <TripCard t={hero} rename={rename} busyId={busyId} onOpen={handleOpen} />
                </section>
              )}

              {discoverOnlyTrips.length > 0 && (
                <section className="explore-rail" aria-label="Continue exploring">
                  <h2 className="section-title">Continue exploring</h2>
                  <div className="explore-rail-row">
                    {discoverOnlyTrips.map(t => <ExploreRailCard key={t.id} t={t} rename={rename} busyId={busyId} onOpen={handleExploreRailOpen} />)}
                  </div>
                </section>
              )}

              {listTrips.map(t => <TripCard key={t.id} t={t} rename={rename} busyId={busyId} onOpen={handleOpen} />)}

              {listTrips.length === 0 && !hero && discoverOnlyTrips.length === 0 && completedTrips.length === 0 && (
                <div className="empty-trips"><p>No trips here yet.</p></div>
              )}

              {completedTrips.length > 0 && (
                <section className="past-trips" aria-label="Past trips">
                  <h2 className="section-title">Past trips</h2>
                  {completedTrips.map(t => <TripCard key={t.id} t={t} rename={rename} busyId={busyId} onOpen={handleOpen} showRename={false} />)}
                </section>
              )}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
