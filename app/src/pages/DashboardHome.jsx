import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useTrip } from '../context/TripContext.jsx';
import { useTripsQuery } from '../hooks/tripQueries.js';
import ContextualAuthModal from '../components/ContextualAuthModal.jsx';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { trackEvent } from '../lib/analytics.js';
import {
  isTripEmpty, isPlanFinished, isPlanDraftReady, planStateLine, planCompletionLabel, planFacts,
  contextDestination, discoveryHeadline, discoveryPills,
} from '../lib/tripLifecycle.js';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import MatchedTripActions from '../components/MatchedTripActions.jsx';
import { isPastTrip, selectHeroTrip, travelWindowDate } from '../lib/tripHero.js';
import { withTripId } from '../lib/tripUrl.js';
import { decodeHtmlEntities } from '../lib/text.js';
import { ROUTES } from '../constants/routes.js';
import { DISCOVER_STAGES } from '../constants/tripStages.js';
import '../styles/dashboard-home.css';

// TWM-232: the Backend owns title composition entirely -- a real
// traveler-set title, or an LLM-generated one Meridian/Guide produce once
// the traveler answers the "anything else?" gate, or the placeholder
// "Untitled Trip" until either exists. No client-side fallback chain here --
// just presence detection, so the uniform card knows whether to render a
// title row at all (the literal placeholder counts as "nothing to show yet",
// same as no title).
// Within Discovering, the trips furthest along come first: a chosen
// destination is waiting on a decision, recommendations on a review, and a
// conversation can pick up whenever. Ties keep the list's own order.
const DISCOVERY_ORDER = { matched: 0, recommended: 1 };
function byDiscoveryStage(a, b) {
  return (DISCOVERY_ORDER[a.lifecycle?.stage] ?? 2) - (DISCOVERY_ORDER[b.lifecycle?.stage] ?? 2);
}

function displayTitle(t) {
  return t.title && t.title !== 'Untitled Trip' ? decodeHtmlEntities(t.title) : null;
}

function matchesSearch(t, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const destination = contextDestination(t) || '';
  return (displayTitle(t) || '').toLowerCase().includes(q) || destination.toLowerCase().includes(q);
}

// TWM-221: hoisted to module scope so a DashboardHome re-render (e.g. a
// background trip prefetch landing) re-renders these in place rather than
// remounting the subtree and dropping an open rename input's focus/value.
// TWM-232: the only call site now only renders this at all once `title` is
// already truthy (see TripCard) -- `label` is never falsy here, so this no
// longer needs its own fallback chain.
function RenameName({ t, rename, showRename = true, label, actionLabel = 'Rename', blankStart = false }) {
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
      {label}{' '}
      {showRename && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => rename.start(blankStart ? { ...t, title: '' } : t)}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// TWM-232: context_recap can carry more facts than a scan-card has room for
// -- cap the visible chips instead of cramming every one into a dot-joined
// line. `limit` is how many show before collapsing into "+N more".
function RecapPills({ pills, limit = 2 }) {
  if (pills.length === 0) return null;
  const shown = pills.slice(0, limit);
  const extra = pills.length - shown.length;
  return (
    <div className="trip-card-recap">
      {shown.map(pill => <span key={pill} className="trip-card-recap-pill">{pill}</span>)}
      {extra > 0 && <span className="trip-card-recap-pill">+{extra} more</span>}
    </div>
  );
}

// TWM-234: a trip still being discovered (matching, recommended or matched).
// One layout for all three, so a list of them reads as one family. Heading,
// most to least preferred: the stored title (the traveler's own or
// Meridian's -- one title, whoever set it), else the most telling fact so far
// (that fact then isn't repeated in the chips), else "New discovery". The line
// beneath is the destination: still open until one is chosen. Matched is the
// one that looks different -- a tinted card where the chosen destination is
// the hero ("Your pick") and the title steps back to a small name tag, so the
// two never read as one line. Rename is always available; with no title yet
// it starts from a blank input. One action per stage: matched offers
// plan-or-reconsider, the others a single way back in.
function DiscoveringTripCard({ t, rename, busyId, onOpen, showRename = true }) {
  const title = displayTitle(t);
  const headline = title ? null : discoveryHeadline(t);
  const stage = t.lifecycle?.stage;
  const matched = stage === 'matched';
  const chosen = matched ? (contextDestination(t) || t.lifecycle?.selected_option?.name) : null;
  return (
    <div className={`card trip-card trip-card-discovering${matched ? ' trip-card-matched' : ''}`}>
      <div>
        <RenameName t={t} rename={rename} showRename={showRename} label={title ?? headline?.text ?? 'New discovery'} blankStart={!title} />
        {chosen && (
          <>
            <div className="trip-card-eyebrow">Your pick</div>
            <div className="trip-card-destination-chosen">{chosen}</div>
          </>
        )}
        {!matched && <div className="trip-card-destination-pending">Destination not chosen yet</div>}
        <RecapPills pills={discoveryPills(t, headline?.key)} limit={4} />
      </div>
      {matched ? <MatchedTripActions tripId={t.id} /> : (
        <button type="button" className="btn btn-ghost" disabled={busyId === t.id} onClick={() => onOpen(t)}>
          {stage === 'recommended' ? 'Review recommendations →' : 'Continue exploring →'}
        </button>
      )}
    </div>
  );
}

// TWM-234: a trip being planned (planning, or a draft plan waiting for review).
// Same anatomy as a Discovering card -- heading (stored title, else the
// destination, which a planning trip always has), one line saying where the
// plan stands, chips, one action -- so the first two steps of each module
// read alike. The line leads with the destination when a title is the heading.
function PlanTripCard({ t, rename, busyId, onOpen, showRename = true }) {
  const title = displayTitle(t);
  const destination = contextDestination(t);
  const heading = title ?? destination ?? discoveryHeadline(t)?.text ?? 'New trip';
  return (
    <div className="card trip-card trip-card-plan">
      <div>
        <RenameName t={t} rename={rename} showRename={showRename} label={heading} blankStart={!title} />
        <div className="trip-card-line">{title && destination && <><b>{destination}</b> · </>}{planStateLine(t)}</div>
        <RecapPills pills={discoveryPills(t)} limit={4} />
      </div>
      <button type="button" className="btn btn-ghost" disabled={busyId === t.id} onClick={() => onOpen(t)}>
        {isPlanDraftReady(t) ? 'Review plan →' : 'Continue planning →'}
      </button>
    </div>
  );
}

// TWM-234: a finished trip -- the Plan module's own ending, deliberately not
// a mirror of the matched card. A sage card for something already made: what
// state it ended in, its name, and the facts that matter once a trip is real
// (when, how long, who) as a line rather than chips, with one way to open it.
function PlannedTripCard({ t, rename, busyId, onOpen, showRename = true }) {
  const title = displayTitle(t);
  const destination = contextDestination(t);
  const heading = title ?? destination ?? 'Your trip';
  const parts = [...(title && destination ? [<b key="destination">{destination}</b>] : []), ...planFacts(t)];
  return (
    <div className="card trip-card trip-card-planned">
      <div>
        <div className="trip-card-eyebrow">{planCompletionLabel(t)}</div>
        <RenameName t={t} rename={rename} showRename={showRename} label={heading} blankStart={!title} />
        {parts.length > 0 && (
          <p className="trip-card-facts">{parts.map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{part}</Fragment>)}</p>
        )}
      </div>
      <button type="button" className="btn btn-primary" disabled={busyId === t.id} onClick={() => onOpen(t)}>Open trip →</button>
    </div>
  );
}

// One card family per module stage: Discovering (matching / recommended /
// matched), Plan in progress, Plan finished.
function TripCard(props) {
  const { t } = props;
  if (DISCOVER_STAGES.has(t.lifecycle?.stage)) return <DiscoveringTripCard {...props} />;
  return isPlanFinished(t) ? <PlannedTripCard {...props} /> : <PlanTripCard {...props} />;
}

// TWM-234: the shared markup behind every trip-list section (Discovering,
// Your trips, Past) -- extracted so adding the Discovering/Your trips split
// didn't just duplicate the same section JSX a second time.
// TWM-234: the Plan module's section. A trip happening now leads,
// then the upcoming trips; past trips sit collapsed at the bottom so
// they never push the Discovering section out of view.
function YourTripsSection({ hero, trips, pastTrips, standalone, rename, busyId, onOpen }) {
  if (!hero && trips.length === 0 && pastTrips.length === 0) return null;
  const card = (t, showRename = true) => <TripCard key={t.id} t={t} rename={rename} busyId={busyId} onOpen={onOpen} showRename={showRename} />;
  return (
    <section aria-label="Your trips">
      <h2 className="section-title">Your trips</h2>
      {hero && (
        <div className="hero-trip">
          <h3 className="trip-group-label">Happening now</h3>
          {card(hero)}
        </div>
      )}
      {trips.length > 0 && (
        <>
          <h3 className="trip-group-label">Upcoming trips</h3>
          {trips.map(t => card(t))}
        </>
      )}
      <PastTrips trips={pastTrips} card={card} startOpen={standalone && !hero && trips.length === 0} />
    </section>
  );
}

// Collapsed by default, unless past trips are all the traveler has -- then
// hiding them would leave an empty-looking page.
function PastTrips({ trips, card, startOpen }) {
  const [open, setOpen] = useState(startOpen);
  if (trips.length === 0) return null;
  return (
    <div className="past-trips">
      <button type="button" className="past-trips-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span>Past trips ({trips.length})</span><span>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && trips.map(t => card(t, false))}
    </div>
  );
}

function TripListSection({ label, title, trips, rename, busyId, onOpen, className, showRename = true }) {
  if (trips.length === 0) return null;
  return (
    <section className={className} aria-label={label}>
      <h2 className="section-title">{title}</h2>
      {trips.map(t => <TripCard key={t.id} t={t} rename={rename} busyId={busyId} onOpen={onOpen} showRename={showRename} />)}
    </section>
  );
}

// Dashboard-as-home (TWM-163): the product's home surface once a traveler
// has any trips, mounted directly at both `/` and `/my-trips`. Distinct from
// TripDashboard.jsx, the per-trip itinerary/booking view a card here links
// into — naming kept separate so the two are never confused.
//
// TWM-172/TWM-232: two states. True empty (no trips at all) shows only the
// two entry doors — no list, no search. Returning groups by date, not
// lifecycle stage: a date-priority hero ("Happening now"), one uniform
// "Your trips" list for everything else regardless of stage (search scoped
// to the traveler's own trips), and a quiet "Past" section for anything
// whose travel window has fully elapsed. The prior stage-based split
// (discover-only rail vs committed list) is gone — every card looks and
// behaves the same way now; Dashboard is where the per-stage next-step
// actually lives.
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
  const pastTrips = visibleTrips.filter(t => isPastTrip(t));
  const activeTrips = visibleTrips.filter(t => !isPastTrip(t));

  // A still-deciding trip (no destination yet) never gets promoted to the
  // prominent hero slot, even if it happens to have a stated travel window
  // (e.g. "traveling in December" said before a destination is picked) --
  // hero eligibility is about having a real trip to spotlight, not about
  // lifecycle stage, but the two aren't the same thing.
  const heroEligible = useMemo(() => activeTrips.filter(t => !DISCOVER_STAGES.has(t.lifecycle?.stage) && contextDestination(t)), [activeTrips]);
  const hero = useMemo(() => selectHeroTrip(heroEligible), [heroEligible]);
  // Nearest known travel date first; trips with no date yet fall to the end,
  // ordered by most recently active — an untouched-but-dated trip shouldn't
  // bury a conversation the traveler just left.
  const listTrips = useMemo(() => activeTrips
    .filter(t => t.id !== hero?.id)
    .slice()
    .sort((a, b) => {
      const dateA = travelWindowDate(a);
      const dateB = travelWindowDate(b);
      if (dateA && dateB) return dateA - dateB;
      if (dateA) return -1;
      if (dateB) return 1;
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    }), [activeTrips, hero]);
  // TWM-234: split the one "Your trips" list into Discovering (no
  // destination committed yet -- not a trip in the traveler's own sense)
  // and actual trips, each its own section with its own CTA verb, instead
  // of one uniform list that reads every card as equally "a trip" even
  // when nothing has been decided yet.
  const discoveringTrips = useMemo(() => listTrips.filter(t => DISCOVER_STAGES.has(t.lifecycle?.stage)).sort(byDiscoveryStage), [listTrips]);
  const planningTrips = useMemo(() => listTrips.filter(t => !DISCOVER_STAGES.has(t.lifecycle?.stage)), [listTrips]);

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
    navigate(`${ROUTES.journeyEntry}?intent=${ENTRY_INTENTS.KNOWN_DESTINATION}`);
  }

  function handleDiscover() {
    trackEvent('intent_selected', { intent: 'discover' });
    startNewTrip();
    setNewTripMenuOpen(false);
    navigate(`${ROUTES.journeyEntry}?intent=${ENTRY_INTENTS.DISCOVER}`);
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

      {notice && <ErrorBanner message={notice} />}

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
              <YourTripsSection hero={hero} trips={planningTrips} pastTrips={pastTrips} standalone={discoveringTrips.length === 0} rename={rename} busyId={busyId} onOpen={handleOpen} />
              <TripListSection label="Discovering" title="Discovering" trips={discoveringTrips} rename={rename} busyId={busyId} onOpen={handleOpen} />

              {listTrips.length === 0 && !hero && pastTrips.length === 0 && (
                <div className="empty-trips"><p>No trips here yet.</p></div>
              )}

            </>
          )}
        </>
      )}
    </Layout>
  );
}
