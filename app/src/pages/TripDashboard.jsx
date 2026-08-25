import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import TripHero from '../components/TripHero.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import SupportContent from '../components/SupportContent.jsx';
import { getItinerary } from '../lib/tripApi.js';
import {
  anchorsByType, anchorsForDay, bookingReadinessLabel, dayCostRange,
  verificationTone, trustStripCounts, bookingReadinessRollup, travelerCount,
} from '../lib/atlasView.js';
import {
  transportLegs, gatewayLegs, transportOptionsFor, feasibleTransportOptions, fetchLegFeasibility,
  stayLegs, activityBookings, notBookedYetLabel, modeLabel, recommendedMode, normalizeTravelerCount,
  PARTNER_LABEL,
} from '../lib/bookingCatalog.js';
import { destinationFactRow, contextFactRows, dashboardPrimaryCta } from '../lib/dashboardTracks.js';
import { isTripEmpty } from '../lib/tripLifecycle.js';
import { tripOriginCity } from '../constants/tripContext.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../lib/useTripFromUrl.js';
import '../styles/dashboard.css';

// TWM-175: 5 tabs, down from 7 — Map folds into Overview's day-strip (it
// was never a real map, just route order), Stays+Transport merge into the
// Bookings story that lands next (this story only adds an inert placeholder
// for that tab, not its real content).
const TABS = [
  { name: 'Overview', icon: '📊' },
  { name: 'Itinerary', icon: '📅' },
  { name: 'Bookings', icon: '🧳' },
  { name: 'Docs', icon: '📁' },
  { name: 'Support', icon: '💬' },
];

const BOOKING_PROMPT_SHOWN_KEY = uiStateKey(UI_STATE_SCREEN.DASHBOARD_OVERVIEW, 'bookingPromptShown');

// Calibrated to the real possible wait (n8n's 180s workflow timeout / FastAPI's
// 185s deadline) — never implies near-instant completion. The first two
// steps optimistically advance over ~40s; the last holds honestly (per
// HonestTransition's own guarantee) for however much longer the real
// generation actually takes.
const ARRIVAL_STEPS = ['Reviewing your approved plan', 'Building your day-by-day itinerary', 'Checking practical details'];
const ARRIVAL_STEP_DURATION_MS = 20000;

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const moneyRange = (low, high) => (low == null || high == null ? null : `${money(low)}–${money(high)}`);
// Atlas categories arrive as raw snake_case (e.g. "arrival_departure_window") — humanize for display.
const humanize = value => value.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

function BudgetBar({ low, high, min, max }) {
  const span = Math.max(max - min, 1);
  const left = ((low - min) / span) * 100;
  const width = Math.max(((high - low) / span) * 100, 3);
  return <div className="budget-track"><div className="budget-fill" style={{ left: `${left}%`, width: `${width}%` }} /></div>;
}

const READINESS_TONE = { suggested: 'positive', needs_advance_booking: 'caution', unresolved: 'negative' };

// Filled shape — deliberately distinct from VerificationTag's outline shape
// so a timeline item carrying both axes (verified/guidance + booking
// readiness) reads as two different kinds of status at a glance, not just
// two different colors.
function BookingReadinessBadge({ status }) {
  if (!status) return null;
  return <StatusPill tone={READINESS_TONE[status] || 'neutral'}>{bookingReadinessLabel(status)}</StatusPill>;
}

// Outline shape — AtlasReference.status (VERIFIED/GENERAL_GUIDANCE) was
// completely invisible in the UI before this story despite being central to
// Atlas's evidence/trust design (the single biggest capability-to-UI
// mismatch the agent-capability audit found).
function VerificationTag({ status }) {
  if (!status) return null;
  const label = status === 'VERIFIED' ? 'Verified' : 'General guidance';
  return <StatusPill tone={verificationTone(status)} variant="outline">{label}</StatusPill>;
}

function AnchorList({ anchors }) {
  if (!anchors.length) return null;
  return (
    <div className="anchor-list" aria-label="Confirmed">
      {anchors.map(anchor => (
        <article className="dashboard-card anchor-card" key={anchor.id}>
          <div>
            <span className="badge badge-confirmed">🔒 confirmed</span>
            <h3>{anchor.label}</h3>
            <p>{anchor.detail}</p>
            {anchor.reference && <div className="confirmation-chip">✓ {anchor.reference}</div>}
            {anchor.notes && <p className="anchor-notes">{anchor.notes}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}

// TWM-184: there was previously no way back from a per-trip Dashboard to
// the trips list — confirmed absent via grep across this file before this
// fix. Reuses BackToTrip.jsx's existing `.back-to-trip` link style (every
// Build screen already has an equivalent reversal link, just pointed at
// Dashboard instead of Home), placed first inside the page per the mockup.
function DashboardBackLink() {
  return (
    <Link className="back-to-trip" to="/">← Back to your trips</Link>
  );
}

// TWM-182: every track CTA lands on a decision-making page (ScoutChat,
// Destinations, TripPreview) that reads real planner_state/matcher_state to
// decide what to do next — never safe to navigate there off ThinStateDashboard's
// possibly-cheap, list-cached tripState (see TripContext.viewTrip). Always
// ensures a full single-trip fetch first, regardless of how the Dashboard
// itself was reached; openTrip is already a no-op if one already happened.
function DashboardCtaButton({ cta, tripId, className }) {
  const navigate = useNavigate();
  const { openTrip } = useTrip();
  const [pending, setPending] = useState(false);

  async function go() {
    if (pending) return;
    setPending(true);
    try {
      await openTrip(tripId);
      navigate(withTripId(cta.to, tripId));
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" className={className} disabled={pending} onClick={go}>{cta.label} →</button>
  );
}

// TWM-182: the non-Overview tabs' pre-freeze placeholder — same "available
// once ready" honesty as the Bookings/Documents track cards, reachable by
// tapping the tab itself (matching the mockup, where the tab bar is present
// even before a plan exists) rather than only via the track board.
function ThinStateTabPlaceholder({ tab }) {
  const note = tab === 'Itinerary'
    ? 'Your day-by-day plan will appear here once Guide finishes it.'
    : 'Available once your itinerary is ready.';
  return (
    <div className="dashboard-card thin-tab-placeholder content-narrow">
      <p>{note}</p>
    </div>
  );
}

// TWM-175/182: Dashboard is reachable from message one, not gated behind
// itinerary-ready — the tab bar, the 4-track board (Route/Day plan/Bookings/
// Documents, Budget explicitly excluded per product decision as its own
// track but still shown as a chip here), and a per-state Overview headline,
// filling in honestly as the trip matures. Never attempts to boot Atlas
// before a plan is actually frozen (the Backend rejects start_itinerary
// otherwise), which is what used to surface as a raw error on an early visit.
function ThinStateDashboard({ tripState, tripId }) {
  const [tab, setTab] = useState('Overview');
  const tripContext = tripState?.trip_context;
  const factRows = [...contextFactRows(tripContext), destinationFactRow(tripState)];
  const primaryCta = dashboardPrimaryCta(tripState);
  return (
    <main className="wrap dashboard">
      <DashboardBackLink />
      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">
        {TABS.map(({ name, icon }) => (
          <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>
            <span className="tab-icon">{icon}</span> {name}
          </button>
        ))}
      </nav>

      {tab === 'Overview' ? (
        <>
          <div className="trip-facts content-narrow">
            <h2 className="trip-facts-heading">Your trip so far</h2>
            {factRows.map(row => (
              <div className="trip-facts-row" key={row.label}>
                <span className="trip-facts-label">{row.label}</span>
                {row.cta ? (
                  <DashboardCtaButton cta={row.cta} tripId={tripId} className="btn btn-ghost" />
                ) : (
                  <span className="trip-facts-value">{row.value}</span>
                )}
              </div>
            ))}
          </div>
          {primaryCta && (
            <div className="thin-state-primary-cta content-narrow">
              <DashboardCtaButton cta={primaryCta} tripId={tripId} className="btn btn-primary" />
            </div>
          )}
        </>
      ) : (
        <ThinStateTabPlaceholder tab={tab} />
      )}
    </main>
  );
}

// TWM-175: the diff-explanation + equal-weight-actions pattern, reused from
// the Discover story's checkpoint (amber-toned here since this is a
// confirmation gate, not an information gap).
function RevisionOverlay({ proposedRevision, pending, error, onKeep, onAccept }) {
  const dayLabel = proposedRevision.affected_days.length > 1
    ? `Days ${proposedRevision.affected_days.join(' and ')}`
    : `Day ${proposedRevision.affected_days[0]}`;
  return (
    <section className="revision-review" aria-label="Proposed itinerary revision">
      <strong>⚠️ This affects {dayLabel}</strong>
      <ul>{proposedRevision.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
      {error && <p className="revision-error" role="alert">{error}</p>}
      <div className="revision-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onKeep}>Keep current itinerary</button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onAccept}>Accept the changes</button>
      </div>
    </section>
  );
}

// TWM-175: shown exactly once, the first time this trip's itinerary is
// generated — not on every subsequent visit (persisted via ui_state).
function BookingPromptOverlay({ onResolveBookings, onLookAround }) {
  return (
    <div className="checkpoint-overlay" role="dialog" aria-modal="true" aria-label="Your itinerary is ready">
      <div className="checkpoint-card">
        <span className="eyebrow">Itinerary ready</span>
        <p className="checkpoint-message">Your itinerary's ready — sort out bookings now, or take a look at the trip first?</p>
        <div className="booking-prompt-actions">
          <button type="button" className="btn btn-ghost" onClick={onLookAround}>Take a look at the trip first</button>
          <button type="button" className="btn btn-primary" onClick={onResolveBookings}>Sort out bookings now</button>
        </div>
      </div>
    </div>
  );
}

function DayStrip({ days, activeDayNumber, onSelectDay }) {
  return (
    <nav className="day-strip" aria-label="Trip days">
      {days.map(day => (
        <button
          type="button"
          key={day.day_number}
          className={`day-strip-pill${day.day_number === activeDayNumber ? ' active' : ''}`}
          onClick={() => onSelectDay(day.day_number)}
        >
          <span className="day-strip-num">{day.day_number}</span>
          <span className="day-strip-location">{day.primary_location}</span>
        </button>
      ))}
    </nav>
  );
}

function TrustStrip({ counts }) {
  const ratioLabel = counts.verifiedCount + counts.generalGuidanceCount === 0
    ? 'No sourced details yet'
    : `${counts.verifiedCount} verified · ${counts.generalGuidanceCount} general guidance`;
  return (
    <div className="trust-strip" aria-label="Trip trust summary">
      <div className="trust-strip-item"><strong>{counts.assumptionsCount}</strong><span>Assumptions made</span></div>
      <div className="trust-strip-item"><strong>{counts.unresolvedCount}</strong><span>Open items</span></div>
      <div className="trust-strip-item"><strong className="trust-strip-ratio">{ratioLabel}</strong><span>Evidence basis</span></div>
    </div>
  );
}

const EMPTY_CONFIRM_FIELDS = { label: '', detail: '', dayNumber: '', reference: '', notes: '' };

function ConfirmationForm({ dayOptions, fields, setFields, onSubmit, onCancel, pending, error }) {
  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <label>What's confirmed?
        <input required value={fields.label} disabled={pending} placeholder="e.g. Delhi to Gwalior train" onChange={event => setFields(previous => ({ ...previous, label: event.target.value }))} />
      </label>
      <label>Details
        <textarea required value={fields.detail} disabled={pending} placeholder="e.g. Confirmed arrival at 2:00 PM via train 12050" onChange={event => setFields(previous => ({ ...previous, detail: event.target.value }))} />
      </label>
      <label>Day
        <select value={fields.dayNumber} disabled={pending} onChange={event => setFields(previous => ({ ...previous, dayNumber: event.target.value }))}>
          <option value="">Not day-specific</option>
          {dayOptions.map(day => <option key={day} value={day}>Day {day}</option>)}
        </select>
      </label>
      <label>Confirmation code (optional)
        <input value={fields.reference} disabled={pending} onChange={event => setFields(previous => ({ ...previous, reference: event.target.value }))} />
      </label>
      <label>Notes (optional)
        <input value={fields.notes} disabled={pending} onChange={event => setFields(previous => ({ ...previous, notes: event.target.value }))} />
      </label>
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending || !fields.label.trim() || !fields.detail.trim()}>Save confirmation</button>
      </div>
    </form>
  );
}

// Keys transportData by route rather than the round-trip bundle's synthetic
// id, so the outbound leg's fetched options/feasibility can be looked up
// the same way whether it's rendered solo or as part of a bundle.
function legKey(leg) {
  return `${leg.from}→${leg.to}`;
}

const MODE_ICON = { flight: '✈️', train: '🚆', bus: '🚌', drive: '🚗' };

// TWM-176: mode-tag component — flight/train/bus/drive labels, reused on
// every transport option card.
function ModeTag({ mode }) {
  return <StatusPill tone="neutral" variant="outline">{MODE_ICON[mode] || '🧭'} {modeLabel(mode)}</StatusPill>;
}

// TWM-132: the real TrustedActionResult.status discriminator
// (resolved/missing_input/unsupported_partner/disabled) plus a client-side
// network-error/no_action fallback — every state renders safely, never a
// broken link. A resolved action with no external target (CHECK_PRICES's
// internal_capability, since no live flight-offer UI exists yet, TWM-146)
// shows an inert note instead of linking to nothing. The affiliate
// disclosure line is a hard requirement carried straight off
// TrustedAction.affiliate_disclosure — never silently dropped.
// TWM-196: flight's CTA is always secondary (btn-ghost), regardless of
// `best` — the affiliate redirect must never visually outrank the API
// offer content above it (FlightLiveOfferInfo). Non-flight modes keep the
// existing best-pick emphasis.
function TrustedActionCta({ option, label, best, secondary = false }) {
  if (option.status === 'resolved' && option.url) {
    return (
      <>
        <a className={`btn ${best && !secondary ? 'btn-primary' : 'btn-ghost'}`} href={option.url} target="_blank" rel="noreferrer">{label}</a>
        {option.affiliateDisclosure && <p className="affiliate-disclosure">This is an affiliate link — TWM may earn a commission.</p>}
      </>
    );
  }
  if (option.status === 'resolved') {
    return <p className="already-booked-note">Live pricing for this isn't available yet.</p>;
  }
  if (option.status === 'error') {
    return <p className="already-booked-note" role="alert">{option.errorMessage}</p>;
  }
  // no_action (drive, feasibility-only) / missing_input / unsupported_partner
  // / disabled: no safe CTA to show, no broken link — inert by design.
  return null;
}

function durationDistanceLabel(option) {
  const parts = [];
  if (option.durationMinutes != null) parts.push(`${Math.round((option.durationMinutes / 60) * 10) / 10}h`);
  if (option.distanceKm != null) parts.push(`${Math.round(option.distanceKm)} km`);
  return parts.join(' · ');
}

// TWM-146: "prices last checked X ago" freshness note — offer.price_found_at
// is the provider's own cache timestamp (twm/schemas/flight_search.py), not
// TWM's request time, so this is honestly "how old is this cached price",
// not "how long ago did we search".
function timeAgoLabel(isoTimestamp) {
  if (!isoTimestamp) return null;
  const ms = Date.now() - new Date(isoTimestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// TWM-196: resolved-airport context (ResolvedAirport, twm/schemas/
// flight_search.py) is Backend data correctness surfaced honestly — never
// a UI guess. Rendered whenever Backend resolved an origin_place/
// destination_place, regardless of search outcome, so a traveler can see
// *which* airports TWM is actually searching even on a clarification/
// unavailable card.
function resolvedRouteLabel(liveOffer) {
  const origin = liveOffer?.originResolved;
  const destination = liveOffer?.destinationResolved;
  if (!origin && !destination) return null;
  return `Flights from ${origin ? origin.iata : '?'} to ${destination ? destination.iata : '?'}`;
}

// TWM-196: date_precision must never be silently dropped. All three
// precisions are cached/indicative (the Aviasales Data API never confirms
// live seat availability — see FlightLiveOfferInfo's own note), but "exact"
// at least matches the traveler's actual day; "month"/"flexible" do not,
// and the card must say so rather than implying the same certainty.
const DATE_PRECISION_LABEL = {
  exact: 'Exact date',
  month: 'Flexible dates — prices for the month',
  flexible: 'Flexible dates — no specific day searched',
};

// Non-blocking nudge for month/flexible precision (TWM-196 UX review):
// copy-only, since no per-leg date-edit flow exists yet to wire a real
// action to — never blocks rendering the card, just names the limitation.
function flightPrecisionNudge(datePrecision) {
  if (datePrecision !== 'month' && datePrecision !== 'flexible') return null;
  return 'Add exact dates for live fares';
}

function flightDepartureTimeLabel(isoTimestamp) {
  if (!isoTimestamp) return null;
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// TWM-146: the live-offer block — clearly a DIFFERENT thing from the CTA
// below it (real Backend-searched price/airline/stops data, no url of its
// own; see bookingCatalog.js's toLiveOffer/resolveFlightOption). Every
// FlightSearchResponseStatus branch is rendered explicitly and safely —
// clarification/unavailable/expired/failed never fall through to a blank
// or misleading card.
function FlightLiveOfferInfo({ liveOffer }) {
  if (!liveOffer) return null;
  const routeLabel = resolvedRouteLabel(liveOffer);
  const precisionLabel = DATE_PRECISION_LABEL[liveOffer.datePrecision] || null;
  const nudge = flightPrecisionNudge(liveOffer.datePrecision);
  const routeContext = (routeLabel || precisionLabel) && (
    <div className="live-offer-route-context">
      {routeLabel && <span className="stay-option-tag">{routeLabel}</span>}
      {precisionLabel && <span className="stay-option-tag">{precisionLabel}</span>}
    </div>
  );
  if (liveOffer.status === 'offer' || liveOffer.status === 'partial') {
    const freshness = timeAgoLabel(liveOffer.priceFoundAt);
    const departureTime = flightDepartureTimeLabel(liveOffer.departureAt);
    return (
      <div className="live-offer-block">
        {routeContext}
        {/* TWM-196 UX review: the Aviasales Data API is a cached lookup,
            never a confirmed-availability check — "Cached" here, never
            "Live"/"Confirmed", regardless of date precision. */}
        <StatusPill tone="neutral" variant="filled">
          {liveOffer.status === 'partial' ? 'Cached price (partial)' : 'Cached price'}
        </StatusPill>
        <strong className="live-offer-price">{liveOffer.priceLabel}</strong>
        <span className="stay-option-tag">
          {liveOffer.airline || 'Airline not disclosed'}
          {liveOffer.flightNumber && ` ${liveOffer.flightNumber}`}
          {liveOffer.stopCount != null && ` · ${liveOffer.stopCount === 0 ? 'Nonstop' : `${liveOffer.stopCount} stop${liveOffer.stopCount === 1 ? '' : 's'}`}`}
        </span>
        {departureTime && <span className="stay-option-tag">Departs {departureTime}</span>}
        <p className="already-booked-note">Not yet confirmed available — check availability before booking.</p>
        {freshness && <span className="stay-option-tag">Updated {freshness}</span>}
        {liveOffer.offerExpiresAt && <span className="stay-option-tag">Expires {new Date(liveOffer.offerExpiresAt).toLocaleString()}</span>}
        {nudge && <span className="stay-option-tag flight-precision-nudge">{nudge}</span>}
      </div>
    );
  }
  if (liveOffer.status === 'clarification_needed') {
    return (
      <div className="live-offer-block">
        {routeContext}
        <p className="already-booked-note">{liveOffer.message}</p>
      </div>
    );
  }
  if (liveOffer.status === 'unavailable') {
    return (
      <div className="live-offer-block">
        {routeContext}
        <p className="already-booked-note" role="alert">{liveOffer.message}</p>
        {nudge && <span className="stay-option-tag flight-precision-nudge">{nudge}</span>}
      </div>
    );
  }
  if (liveOffer.status === 'expired') {
    return <p className="already-booked-note">This cached price has expired — check again for a current one.</p>;
  }
  if (liveOffer.status === 'failed') {
    return <p className="already-booked-note" role="alert">{liveOffer.message || 'Could not load cached flight prices.'}</p>;
  }
  return null;
}

// TWM-196: flight's API offer data (FlightLiveOfferInfo, above) and the
// Aviasales affiliate redirect (TrustedActionCta, below) must read as two
// visibly distinct things, with the affiliate action clearly secondary —
// a traveler should never mistake the partner search link for TWM-resolved
// inventory, or have it visually dominate the card. The CTA names the
// actual Backend-resolved partner (option.partner via PARTNER_LABEL),
// never a hardcoded name, so a future partner change needs no UI copy
// change here.
function flightCtaLabel(option) {
  const partnerLabel = PARTNER_LABEL[option.partner] || option.partner || 'partner';
  return `Check availability on ${partnerLabel} ↗`;
}

function flightAffiliateCaption(option) {
  const partnerLabel = PARTNER_LABEL[option.partner] || option.partner || 'the partner';
  const liveOffer = option.liveOffer;
  if (liveOffer?.status === 'offer' || liveOffer?.status === 'partial') {
    return `Secondary option — confirm the real fare and availability on ${partnerLabel}`;
  }
  return `No TWM-resolved price yet — search directly on ${partnerLabel}`;
}

function TransportOptionCard({ option, best }) {
  const durationDistance = durationDistanceLabel(option);
  const isFlight = option.mode === 'flight';
  return (
    <article className={`stay-option-card${best ? ' picked' : ''}`}>
      {best && <span className="pick-badge">Our pick</span>}
      <ModeTag mode={option.mode} />
      <strong>{option.name}</strong>
      {durationDistance && (
        <span className="stay-option-tag">
          {durationDistance}
          {option.durationSource === 'llm_estimated' && <VerificationTag status={option.verification?.status} />}
        </span>
      )}
      {isFlight && <FlightLiveOfferInfo liveOffer={option.liveOffer} />}
      {isFlight && (
        <span className="stay-option-tag flight-affiliate-caption">{flightAffiliateCaption(option)}</span>
      )}
      <TrustedActionCta
        option={option}
        label={isFlight ? flightCtaLabel(option) : 'Check ↗'}
        best={best}
        secondary={isFlight}
      />
    </article>
  );
}

function StayOptionCard({ option, best }) {
  return (
    <article className={`stay-option-card${best ? ' picked' : ''}`}>
      {best && <span className="pick-badge">Our pick</span>}
      <strong>{option.name}</strong>
      <TrustedActionCta option={option} label="Check stay ↗" best={best} />
    </article>
  );
}

// TWM-132: a "recommended mode" card — shown when at least one feasible
// mode has something actionable (see bookingCatalog.recommendedMode's
// documented selection: fixed priority flight > drive > train > bus among
// feasible, actionable modes).
function RecommendedModeCard({ option }) {
  if (!option) return null;
  return (
    <article className="dashboard-card recommended-mode-card" aria-label="Recommended mode">
      <span className="pick-badge">Recommended</span>
      <ModeTag mode={option.mode} />
      <strong>{modeLabel(option.mode)}</strong>
      {option.reason && <p>{option.reason}</p>}
      <TrustedActionCta option={option} label="Check ↗" best />
    </article>
  );
}

// TWM-195 root-fix simplification: Backend's `modes` list only ever
// contains genuinely route-valid entries now (no more ruled_out/unknown
// bucket to explain "why other modes aren't shown" — a non-route-valid
// mode is simply never sent to the UI at all, never resolved, never
// rendered). This disclosure now just shows the route-plausibility detail
// backing each mode that IS shown (duration/distance/reason), so a
// traveler can see why e.g. train is listed as ~9h/620km.
function FeasibilityDisclosure({ modes }) {
  if (!modes?.length) return null;
  return (
    <details className="feasibility-disclosure">
      <summary>Route details for these modes</summary>
      <ul className="trip-notes-list">
        {modes.map(mode => (
          <li key={mode.mode}>
            <ModeTag mode={mode.mode} />
            {mode.estimated_duration_minutes != null && <> — {Math.round((mode.estimated_duration_minutes / 60) * 10) / 10}h</>}
            {mode.estimated_distance_km != null && <> · {Math.round(mode.estimated_distance_km)} km</>}
            <VerificationTag status={mode.verification?.status} />
            <p>{mode.reason}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

// TWM-176: the shared inline-expansion pattern for an unresolved Transport
// or Stay segment — tapping "Resolve" expands ranked options right here, no
// navigation, no separate Logistics page. Confirmed segments (an anchor
// already exists) skip straight to the 🔒-confirmed treatment.
function BookingSegment({
  label, anchor, expanded, onToggleExpand, loading, loadError, options, renderOption, onOpenConfirm,
  recommended, feasibilityModes, noOptionsMessage,
}) {
  if (anchor) {
    return (
      <article className="dashboard-card anchor-card">
        <div>
          <span className="badge badge-confirmed">🔒 confirmed</span>
          <h3>{anchor.label}</h3>
          <p>{anchor.detail}</p>
          {anchor.reference && <div className="confirmation-chip">✓ {anchor.reference}</div>}
        </div>
      </article>
    );
  }
  return (
    <div className="stay-block">
      <div className="stay-block-head">
        <div>
          <span className="state suggested">{notBookedYetLabel(label)}</span>
          <h3 className="route-title">{label}</h3>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onToggleExpand} aria-expanded={expanded}>{expanded ? 'Hide options ▴' : 'Resolve ▾'}</button>
      </div>
      {expanded && (
        <>
          {loading && <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>}
          {loadError && <p className="already-booked-note" role="alert">{loadError}</p>}
          {!loading && !loadError && (options || []).length === 0 && (
            <p className="already-booked-note" role="status">{noOptionsMessage || 'No bookable transport options for this leg.'}</p>
          )}
          {!loading && !loadError && (options || []).length > 0 && (
            <>
              {recommended !== undefined && <RecommendedModeCard option={recommended} />}
              <div className="stay-options-grid">{(options || []).map((option, index) => renderOption(option, recommended ? option === recommended : index === 0))}</div>
              {feasibilityModes && <FeasibilityDisclosure modes={feasibilityModes} />}
            </>
          )}
          <p className="already-booked-note">Already booked this yourself? <button type="button" className="link-button" onClick={onOpenConfirm}>Add a confirmation →</button></p>
        </>
      )}
    </div>
  );
}

// TWM-176: Activity bookings only ever come from real Atlas-flagged
// requires_advance_booking items — no mock options catalog, since there's
// no realistic "shop for an activity" search to fabricate. Just a
// self-confirm affordance, framed as the exception for that day.
function ActivitySegment({ activity, anchor, onOpenConfirm }) {
  if (anchor) {
    return (
      <article className="dashboard-card anchor-card">
        <div>
          <span className="badge badge-confirmed">🔒 confirmed</span>
          <h3>{anchor.label}</h3>
          <p>{anchor.detail}</p>
          {anchor.reference && <div className="confirmation-chip">✓ {anchor.reference}</div>}
        </div>
      </article>
    );
  }
  return (
    <div className="stay-block">
      <div className="stay-block-head">
        <div>
          <span className="state suggested">{notBookedYetLabel(activity.title)}</span>
          <h3 className="route-title">{activity.title} · Day {activity.dayNumber}</h3>
          <p>{activity.detail}</p>
        </div>
      </div>
      <p className="already-booked-note">Already booked this yourself? <button type="button" className="link-button" onClick={onOpenConfirm}>Add a confirmation →</button></p>
    </div>
  );
}

export default function TripDashboard() {
  const { commandSnapshot, sendTripCommand, tripLoadStatus, uiState, updateUiState, viewTrip } = useTrip();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // TWM-185: reload/bookmark/deep-link safe — resolves whichever trip
  // ?tripId= names, cheaply (matches DashboardHome's own "Open trip →" cost
  // tradeoff: viewTrip renders off the cached list entry with zero network
  // cost for the common case, still fetches full detail in the background).
  const urlTripId = useTripFromUrl(viewTrip);
  const initialTab = TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Overview';
  const [tab, setTab] = useState(initialTab);
  const [activeDay, setActiveDay] = useState(null);

  const tripState = commandSnapshot?.trip_state;
  const plannerState = tripState?.planner_state;
  const frozenPlan = plannerState?.frozen_plan;
  const itineraryState = tripState?.itinerary_state;
  const anchors = tripState?.logistics_state?.anchors ?? [];
  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const [showBookingPrompt, setShowBookingPrompt] = useState(false);
  const bootStarted = useRef(false);

  // The active itinerary's full result is fetched lazily (TWM-159/160) — it
  // no longer arrives inline on commandSnapshot. This is a separate signal
  // from bootStatus/itineraryState?.status on purpose: the boot guard above
  // must decide whether to (re-)invoke start_itinerary from commandSnapshot
  // alone, never from whether this fetch has resolved, or a slow fetch could
  // race the guard into wrongly re-firing start_itinerary against transient
  // empty state.
  const [itineraryStatus, setItineraryStatus] = useState('idle'); // idle | loading | ready | error
  const [itineraryResult, setItineraryResult] = useState(null);
  const [itineraryFetchError, setItineraryFetchError] = useState(null);
  // Tracks which trip the current/last fetch belongs to, not just whether
  // one has started — otherwise switching trips without unmounting (e.g. a
  // future in-app trip switcher) would keep itineraryFetchStarted.current
  // stuck true from the previous trip, skip refetching, and render the
  // previous trip's itinerary under the new one.
  const [itineraryTripId, setItineraryTripId] = useState(null);
  const itineraryFetchStarted = useRef(null); // tripId currently/last fetched, or null

  const [revisionPending, setRevisionPending] = useState(false);
  const [revisionError, setRevisionError] = useState(null);

  const [expandedBookingId, setExpandedBookingId] = useState(null);
  const [confirmType, setConfirmType] = useState(null); // 'transport' | 'stay' | 'activity' | null
  const [confirmFields, setConfirmFields] = useState(EMPTY_CONFIRM_FIELDS);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  // TWM-132: transportOptionsFor/stayOptionsFor/feasibility are now real
  // network calls (TWM-130/131's trusted-action + feasibility endpoints),
  // so the Bookings tab's data is fetched lazily here instead of computed
  // synchronously during render — mirrors the itinerary fetch's
  // loading/ready/error pattern above. Keyed by a leg's "from→to" string
  // (transportData) or a stay's id (stayData) so lookups don't depend on
  // the round-trip bundle's synthetic id.
  const [bookingsStatus, setBookingsStatus] = useState('idle'); // idle | loading | ready | error
  // TWM-195: a transport-section resolution/feasibility failure must stay
  // local to Transport and never take down the already-independent Stay
  // section (or vice versa) — split out of the single shared bookingsError
  // so one section's failure can never surface as the other's loadError.
  const [transportError, setTransportError] = useState(null);
  const [stayError, setStayError] = useState(null);
  const [transportData, setTransportData] = useState({});
  const [stayData, setStayData] = useState({});
  const bookingsFetchStarted = useRef(null); // `${tripId}:${itineraryResult.version}:${originCity}` currently/last fetched, or null

  const tripId = commandSnapshot?.id;

  // TWM-188: a direct/deep-link/stale-tab navigation to an empty
  // (trip_context-less) trip has nothing real to render here — redirect
  // home instead of rendering a blank/default dashboard. Gated on a URL
  // tripId so a genuinely fresh, not-yet-created trip reached without one
  // is unaffected.
  useEffect(() => {
    if (!urlTripId || tripLoadStatus !== 'ready' || !isTripEmpty(tripState)) return;
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTripId, tripLoadStatus, tripState, navigate]);

  useEffect(() => {
    if (tab !== 'Bookings' || itineraryStatus !== 'ready' || !tripId || !itineraryResult) return;
    // Keyed by more than just tripId — a bare tripId key means this guard
    // never resets while the same trip stays mounted, even when the
    // itinerary is revised (resolveRevision -> a new itineraryResult) or
    // origin_city changes, so Bookings would keep serving stale
    // transport/stay data until a full reload. itineraryResult.version
    // (the itinerary body's own revision number, not commandSnapshot's)
    // and origin_city are exactly the two inputs gatewayLegs/transportLegs
    // below actually depend on, so the guard is keyed on both.
    const bookingsFetchKey = `${tripId}:${itineraryResult.version}:${tripOriginCity(tripState?.trip_context) ?? ''}`;
    if (bookingsFetchStarted.current === bookingsFetchKey) return;
    bookingsFetchStarted.current = bookingsFetchKey;
    setBookingsStatus('loading');

    const bookingDays = itineraryResult.result.final_itinerary.days;
    // TWM-200: transportLegs derives every structured TRAVEL movement —
    // solely from Atlas's own from_city/to_city, never a UI-synthesized
    // origin bookend. TWM-195 (MVP scope narrowing): Bookings Transport is
    // gateway-only — gatewayLegs filters that full list down to just the
    // outbound-from-origin and return-to-origin rows BEFORE any
    // feasibility/trusted-action/flight-search call fires, so internal/
    // circuit/local movements never hit the network at all, not merely
    // hidden after the fact. No round-trip bundling either way.
    const legsToFetch = gatewayLegs(transportLegs(bookingDays), tripOriginCity(tripState?.trip_context));
    const stays = stayLegs(bookingDays);
    // TWM-146/TWM-195/TWM-199: threaded through to flight's live-offer
    // search and Trusted Action's traveler_count so those payloads are
    // populated whenever it's known, instead of always hitting
    // clarification_needed for a field we actually have — see
    // bookingCatalog.searchFlightOffer's comment for why departure_date/
    // IATA still aren't threaded through today. Canonical
    // trip_context.num_travelers (normalized — it can arrive as a
    // chat-entered string like '2') is the primary source, with Atlas's own
    // trip_summary.num_travelers kept as a fallback — the review comment
    // only demanded removing the *origin* fallback, not this one.
    const partySize = normalizeTravelerCount(tripState?.trip_context?.num_travelers)
      ?? travelerCount(itineraryResult.result.final_itinerary.trip_summary);

    let cancelled = false;
    setTransportError(null);
    setStayError(null);
    (async () => {
      // TWM-195: Transport and Stay are fetched and error-isolated
      // independently (Promise.allSettled, not Promise.all) — a transport
      // resolution or feasibility failure must never blank out or error
      // the already-fetched/fetching Stay section, and vice versa.
      const [transportOutcome, stayOutcome] = await Promise.allSettled([
        Promise.all(legsToFetch.map(async leg => {
          // TWM-195 root fix: feasibility must be fetched and read FIRST,
          // and only its approved modes are ever resolved — never
          // Promise.all-concurrent with resolution. A failed/missing
          // feasibility fetch (caught to null here) resolves zero modes,
          // exactly like an honest `modes: []` response — never a
          // fallback that tries every mode.
          const feasibility = await fetchLegFeasibility(tripId, leg).catch(() => null);
          const approvedModes = (feasibility?.modes || []).map(entry => entry.mode);
          const options = await transportOptionsFor(tripId, leg, partySize, approvedModes);
          return [legKey(leg), { options, feasibility }];
        })),
        // TWM-195 review comment (blocker): stay/hotel affiliate resolution
        // is explicitly out of scope for this first mode-visibility slice —
        // Backend's trusted-action readiness currently requires route/date/
        // traveler fields that a stay leg doesn't genuinely have, so eagerly
        // calling resolveTrustedAction(domain: 'stay') here only produced
        // noisy missing_input responses. `stayOptionsFor`/the stay-partner
        // resolution code in bookingCatalog.js is intentionally left intact
        // (not deleted) for the future hotel/stay affiliate story to wire
        // back in — it is simply not called from this flow anymore. Each
        // stay leg instead gets a stable, honest "not yet available"
        // result (`status: 'not_available'`, no options) that the Stay
        // section renders directly rather than an empty options list.
        Promise.resolve(stays.map(stay => [stay.id, { options: [], notAvailable: true }])),
      ]);
      if (cancelled) return;

      if (transportOutcome.status === 'fulfilled') {
        setTransportData(Object.fromEntries(transportOutcome.value));
      } else {
        setTransportError(transportOutcome.reason?.message || 'Could not load transport options.');
      }

      if (stayOutcome.status === 'fulfilled') {
        setStayData(Object.fromEntries(stayOutcome.value));
      } else {
        setStayError(stayOutcome.reason?.message || 'Could not load stay options.');
      }

      setBookingsStatus(
        transportOutcome.status === 'rejected' && stayOutcome.status === 'rejected' ? 'error' : 'ready'
      );
    })();
    return () => { cancelled = true; };
  }, [tab, itineraryStatus, tripId, itineraryResult, tripState?.trip_context?.origin_city]);

  const trackedThinState = useRef(false);
  useEffect(() => {
    if (trackedThinState.current || tripLoadStatus !== 'ready' || frozenPlan) return;
    trackedThinState.current = true;
    trackEvent('dashboard_thin_state_viewed', { stage: tripState?.stage ?? 'new' });
  }, [tripLoadStatus, frozenPlan, tripState?.stage]);

  // Reopen never re-invokes Atlas: once ready, render the saved result and
  // never call start_itinerary again for this trip. Must wait for the trip
  // to finish loading and a plan to actually be frozen — calling
  // start_itinerary before that is a real Backend rejection (the approved
  // plan is the prerequisite), not just an empty state.
  useEffect(() => {
    if (tripLoadStatus !== 'ready' || !frozenPlan) return;
    if (itineraryState?.status === 'ready') {
      setBootStatus('ready');
      return;
    }
    if (bootStarted.current) return;
    bootStarted.current = true;
    setBootStatus('booting');
    sendTripCommand('start_itinerary')
      .then(response => {
        // A touched-branches command response (TWM-154) includes itinerary_state
        // only when this call actually generated it — apply_atlas's idempotent
        // no-op path (already ready backend-side) leaves it untouched, so this
        // distinguishes a real generation from a harmless re-request.
        if (response.trip?.trip_state?.itinerary_state) {
          trackEvent('itinerary_generated', { generation_type: 'atlas' });
          if (!uiState[BOOKING_PROMPT_SHOWN_KEY]) {
            setShowBookingPrompt(true);
            trackEvent('booking_prompt_shown', {});
            updateUiState({ [BOOKING_PROMPT_SHOWN_KEY]: true }).catch(() => {});
          }
        }
        setBootStatus('ready');
      })
      .catch(error => {
        trackFailure('itinerary_generation', error);
        setBootStatus('error');
        setBootError(error.message || 'Could not generate the detailed itinerary.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, frozenPlan, itineraryState?.status, sendTripCommand]);

  // Fetches the itinerary body only once the boot guard above has confirmed
  // (via commandSnapshot, not this fetch) that a ready itinerary exists
  // backend-side. itineraryFetchStarted mirrors bootStarted's guard so this
  // fires exactly once per Dashboard visit.
  useEffect(() => {
    if (bootStatus !== 'ready' || itineraryState?.status !== 'ready' || !tripId) return;
    if (itineraryFetchStarted.current === tripId) return;
    itineraryFetchStarted.current = tripId;
    setItineraryStatus('loading');
    getItinerary(tripId)
      .then(record => {
        setItineraryResult(record);
        setItineraryTripId(tripId);
        setItineraryStatus('ready');
      })
      .catch(error => {
        setItineraryStatus('error');
        setItineraryFetchError(error.message || 'Could not load the detailed itinerary.');
      });
  }, [bootStatus, itineraryState?.status, tripId]);

  const trackedDashboardEntry = useRef(false);
  useEffect(() => {
    if (trackedDashboardEntry.current || itineraryStatus !== 'ready') return;
    trackedDashboardEntry.current = true;
    trackEvent('itinerary_viewed', { view_source: 'dashboard' });
    trackEvent('dashboard_entered', { entry_source: 'itinerary' });
  }, [itineraryStatus]);

  async function resolveRevision(command) {
    setRevisionPending(true);
    setRevisionError(null);
    try {
      await sendTripCommand(command);
      trackEvent(command === 'accept_itinerary_revision' ? 'itinerary_revision_accepted' : 'itinerary_revision_kept', {});
    } catch (error) {
      setRevisionError(error.message || 'Could not update the itinerary.');
    } finally {
      setRevisionPending(false);
    }
  }

  // TWM-195 review comment: round-trip bundling is gone — every segment is
  // its own directional row now, so there's no longer an is_round_trip_bundle
  // distinction to track here.
  function toggleExpandedBooking(id, segmentType) {
    setExpandedBookingId(previous => {
      const next = previous === id ? null : id;
      if (next) {
        trackEvent('booking_intent', { booking_type: 'browse_options', segment_type: segmentType });
      }
      return next;
    });
  }

  function openConfirmForm(type, label, dayNumber) {
    setConfirmType(type);
    setConfirmFields({ ...EMPTY_CONFIRM_FIELDS, label, dayNumber: dayNumber ? String(dayNumber) : '' });
    setConfirmError(null);
  }

  async function submitConfirmForm(event) {
    event.preventDefault();
    setConfirmPending(true);
    setConfirmError(null);
    try {
      await sendTripCommand('confirm_logistics', {
        logisticsConfirmation: {
          type: confirmType,
          label: confirmFields.label.trim(),
          detail: confirmFields.detail.trim(),
          day_number: confirmFields.dayNumber ? Number(confirmFields.dayNumber) : null,
          reference: confirmFields.reference.trim() || null,
          notes: confirmFields.notes.trim() || null,
        },
      });
      setConfirmType(null);
    } catch (error) {
      setConfirmError(error.message || 'Could not save that confirmation.');
    } finally {
      setConfirmPending(false);
    }
  }

  function resolveBookingPrompt(destination) {
    trackEvent('booking_prompt_choice', { choice: destination });
    setShowBookingPrompt(false);
    if (destination === 'bookings') setTab('Bookings');
  }

  // TWM-182: viewTrip's cache-only render (see TripContext.jsx) still fires
  // a background openTrip to confirm the trip actually exists server-side —
  // the one thing its cheap path skips that the full fetch used to guarantee
  // for free (TWM-109, a trip deleted from another session/device). If that
  // comes back 404, dropUnavailableTrip clears commandSnapshot to null while
  // the traveler is already looking at this page — surface it plainly rather
  // than falling through to an empty-looking thin state.
  if (tripLoadStatus === 'ready' && !commandSnapshot) {
    return (
      <main className="wrap dashboard">
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Trip unavailable</strong>
          <span>This trip is no longer available.</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Back to your trips</button>
      </main>
    );
  }

  // TWM-175: reachable from message one — never attempts to boot Atlas
  // before a plan is frozen, so an early visit shows a real recap + CTA
  // instead of a crash or a blank page.
  if (tripLoadStatus === 'ready' && !frozenPlan) {
    return <ThinStateDashboard tripState={tripState} tripId={tripId} />;
  }

  if (bootStatus === 'error') {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Itinerary unavailable</strong>
          <span>{bootError}</span>
        </div>
      </main>
    );
  }

  if (itineraryStatus === 'error') {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Itinerary unavailable</strong>
          <span>{itineraryFetchError}</span>
        </div>
      </main>
    );
  }

  if (bootStatus === 'booting' && itineraryState?.status !== 'ready') {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <HonestTransition steps={ARRIVAL_STEPS} label="Building your itinerary" stepDurationMs={ARRIVAL_STEP_DURATION_MS} />
      </main>
    );
  }

  if (bootStatus !== 'ready' || itineraryState?.status !== 'ready' || itineraryStatus !== 'ready' || itineraryTripId !== tripId) {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading your trip…</div>
      </main>
    );
  }

  const result = itineraryResult.result;
  const finalItinerary = result.final_itinerary;
  const days = finalItinerary.days;
  const selectedDay = days.find(day => day.day_number === activeDay) || days[0];
  const selectedDayCost = dayCostRange(selectedDay);
  const allCosts = days.flatMap(day => { const range = dayCostRange(day); return [range.low, range.high]; });
  const costMin = Math.min(...allCosts, 0);
  const costMax = Math.max(...allCosts, 1);
  const proposedRevision = itineraryState.proposed_revision;
  const trustCounts = trustStripCounts(finalItinerary, result);
  const readiness = bookingReadinessRollup(days, anchors);

  const dayNumbers = days.map(day => day.day_number);
  const transportAnchors = anchorsByType(anchors, 'transport');
  const stayAnchors = anchorsByType(anchors, 'stay');
  const activityAnchors = anchorsByType(anchors, 'activity');
  // Matches by exact string equality against the anchor's stored `.label`
  // (anchors have no stable id linking them back to a computed segment).
  // Every call site below that builds a `label` for a segment/confirm form
  // is part of this contract — changing that formatting without updating
  // this matcher will silently reclassify real confirmed anchors as orphaned.
  const findAnchor = (typeAnchors, label) => typeAnchors.find(a => a.label === label);
  // TWM-200: transportLegs derives legs solely from Atlas's own structured
  // TRAVEL.from_city/to_city movements — no origin argument, no
  // UI-synthesized bookend leg. TWM-195 (MVP scope narrowing): render-side
  // must filter to the same gateway-only rows the fetch effect resolved —
  // never a wider render-side list than what was actually fetched, and
  // (per TWM-195) no round-trip bundling either way.
  const transportLegList = gatewayLegs(transportLegs(days), tripOriginCity(tripState?.trip_context));
  const stayLegList = stayLegs(days);
  const activityList = activityBookings(days);

  // Orphan anchors: confirmations left over from a route the current
  // itinerary no longer computes (e.g. after a regeneration). Segments
  // already show their own matching anchor inline, so only anchors with
  // no matching segment need the generic AnchorList fallback here.
  const transportLabels = new Set(transportLegList.map(leg => `${leg.from} → ${leg.to}`));
  const stayLabels = new Set(stayLegList.map(stay => `${stay.location} · ${stay.nights} night${stay.nights === 1 ? '' : 's'}`));
  const activityLabels = new Set(activityList.map(activity => activity.title));
  const orphanTransportAnchors = transportAnchors.filter(a => !transportLabels.has(a.label));
  const orphanStayAnchors = stayAnchors.filter(a => !stayLabels.has(a.label));
  const orphanActivityAnchors = activityAnchors.filter(a => !activityLabels.has(a.label));

  return (
    <main className="wrap dashboard">
      <DashboardBackLink />
      {showBookingPrompt && (
        <BookingPromptOverlay
          onResolveBookings={() => resolveBookingPrompt('bookings')}
          onLookAround={() => resolveBookingPrompt('overview')}
        />
      )}
      <TripHero
        finalItinerary={finalItinerary}
        actions={<>
          <button className="btn btn-ghost" type="button" onClick={() => alert('PDF generation is not available yet.')}>📄 PDF</button>
          <button className="btn btn-ghost" type="button" onClick={() => alert('Sharing is not available yet.')}>🔗 Share</button>
        </>}
      />

      {proposedRevision && (
        <RevisionOverlay
          proposedRevision={proposedRevision}
          pending={revisionPending}
          error={revisionError}
          onKeep={() => resolveRevision('keep_current_itinerary')}
          onAccept={() => resolveRevision('accept_itinerary_revision')}
        />
      )}

      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">{TABS.map(({ name, icon }) => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}><span className="tab-icon">{icon}</span> {name}</button>)}</nav>

      {tab === 'Overview' && <section aria-label="Trip overview">
        <DayStrip
          days={days}
          activeDayNumber={selectedDay.day_number}
          onSelectDay={dayNumber => { setActiveDay(dayNumber); setTab('Itinerary'); }}
        />
        {finalItinerary.trip_summary.route_rationale && (
          <div className="route-rationale"><span className="hero-why-label">Why this route</span><p>{finalItinerary.trip_summary.route_rationale}</p></div>
        )}

        <TrustStrip counts={trustCounts} />

        <div className="tab-intro"><div><h2>💰 Estimated budget</h2><p>{finalItinerary.budget_summary.budget_fit}</p></div></div>
        <BudgetBar low={finalItinerary.budget_summary.total_low} high={finalItinerary.budget_summary.total_high} min={0} max={Math.max(finalItinerary.budget_summary.total_high, 1)} />
        <div className="budget-summary-card">
          {finalItinerary.budget_summary.lines.map((line, index) => <div className="budget-summary-row" key={index}><span>{line.category}</span><strong>{moneyRange(line.amount_low, line.amount_high)}</strong><p>{line.note}</p></div>)}
          <div className="budget-summary-row total"><span>Estimated total</span><strong>{moneyRange(finalItinerary.budget_summary.total_low, finalItinerary.budget_summary.total_high)}</strong></div>
        </div>

        <div className="readiness-row">
          <span>{readiness.ready} of {readiness.total} bookable items ready</span>
          {readiness.total > readiness.ready && (
            <button type="button" className="btn btn-ghost" onClick={() => setTab('Bookings')}>Resolve bookings →</button>
          )}
        </div>

        <div className="sources-list">
          <h3>Sources</h3>
          {finalItinerary.sources.length > 0
            ? <ul>{finalItinerary.sources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul>
            : <p className="honest-empty">No external sources cited.</p>}
        </div>

        {(finalItinerary.assumptions.length > 0 || result.unresolved.length > 0 || finalItinerary.practical_notes.length > 0) && (
          <details className="trip-notes-disclosure">
            <summary>Trip notes — assumptions, open items, and good-to-knows</summary>

            {result.unresolved.length > 0 && (
              <>
                <div className="tab-intro"><div><h2>❓ Unresolved</h2><p>Worth checking closer to your travel dates.</p></div></div>
                <div className="insight-grid">
                  {result.unresolved.map((item, index) => (
                    <div className="insight-card insight-card-unresolved" key={index}>
                      <span className="insight-badge insight-badge-unresolved">{item.item}</span>
                      <p>{item.generic_guidance}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(finalItinerary.assumptions.length > 0 || finalItinerary.practical_notes.length > 0) && (
              <ul className="trip-notes-list">
                {finalItinerary.assumptions.map((item, index) => (
                  <li key={`a${index}`}><strong>{humanize(item.category)}</strong> — {item.detail}</li>
                ))}
                {finalItinerary.practical_notes.map((note, index) => (
                  <li key={`p${index}`}><strong>{note.title}</strong> — {note.detail} <VerificationTag status={note.reference?.status} /></li>
                ))}
              </ul>
            )}
          </details>
        )}
      </section>}

      {tab === 'Docs' && <section aria-label="Trip documents">
        <div className="tab-intro"><div><h2>📁 Documents</h2><p>Flight tickets, hotel confirmations, and other trip documents.</p></div></div>
        <div className="docs-placeholder">
          <span className="docs-placeholder-icon">📁</span>
          <strong>Coming soon</strong>
          <p>Once this is ready, you'll be able to collect everything for this trip in one place — flight and train tickets, hotel confirmations, and copies of IDs you'll need on the road.</p>
        </div>
      </section>}

      {tab === 'Itinerary' && selectedDay && <section aria-label="Detailed days" className="dashboard-days-wrap">
        <nav className="dashboard-day-nav" aria-label="Select a day">
          {days.map(day => <button type="button" key={day.day_number} className={`dashboard-day-pill${day.day_number === selectedDay.day_number ? ' active' : ''}`} aria-current={day.day_number === selectedDay.day_number ? 'page' : undefined} onClick={() => setActiveDay(day.day_number)}>
            <span className="pill-num">{day.day_number}</span>
            <span className="pill-text"><span className="label">Day {day.day_number}</span><span className="base">{day.primary_location}</span></span>
          </button>)}
        </nav>
        <div className="dashboard-days-main">
          <article className="atlas-day compact">
            <header>
              <span className="atlas-day-eyebrow">Day {String(selectedDay.day_number).padStart(2, '0')} · {days.length} days total</span>
              <h2>{selectedDay.title}</h2>
              <p className="atlas-day-route">📍 {selectedDay.primary_location}</p>
              <p>{selectedDay.summary}</p>
            </header>
            <AnchorList anchors={anchorsForDay(anchors, selectedDay.day_number)} />
            <div className="atlas-timeline">
              {selectedDay.timeline.map((item, index) => <div className="atlas-item" key={index}>
                <span className="atlas-dot">{item.kind === 'TRAVEL' ? '🚗' : item.kind === 'STAY' ? '🏨' : item.kind === 'MEAL' ? '🍽️' : item.kind === 'FREE_TIME' ? '🕒' : '📍'}</span>
                <div>
                  <time>{item.start_time || 'Flexible'}{item.end_time ? ` – ${item.end_time}` : ''}</time>
                  <div className="item-summary-row">
                    <strong>{item.title}</strong>
                    {moneyRange(item.estimated_cost_low, item.estimated_cost_high) && <span className="item-cost">{moneyRange(item.estimated_cost_low, item.estimated_cost_high)}</span>}
                    <VerificationTag status={item.reference?.status} />
                    <BookingReadinessBadge status={item.booking_readiness} />
                  </div>
                  <p>{item.detail}</p>
                  {item.movement_guidance && <p className="movement-guidance">{item.movement_guidance}</p>}
                </div>
              </div>)}
            </div>
            <div className="atlas-day-footer">
              <div className="footer-budget">
                <span className="footer-label">💰 Estimated for this day</span>
                <strong>{moneyRange(selectedDayCost.low, selectedDayCost.high) || 'Not estimated'}</strong>
                <BudgetBar low={selectedDayCost.low} high={selectedDayCost.high} min={costMin} max={costMax} />
              </div>
              <div className="footer-tips">
                <span className="footer-label">🎒 Good to know</span>
                <ul className="tips-list">
                  <li><span>🌦️</span>{selectedDay.seasonal_guidance}</li>
                  <li><span>🎫</span>{selectedDay.permit_or_ticket_guidance}</li>
                  {selectedDay.backup_plan && <li><span>🔁</span>{selectedDay.backup_plan}</li>}
                </ul>
              </div>
            </div>
          </article>
        </div>
      </section>}

      {tab === 'Bookings' && <section aria-label="Bookings">
        <div className="tab-intro"><div><h2>🚗 Transport</h2><p>Getting to and from {tripOriginCity(tripState?.trip_context) || 'your trip'} — schedules and fares are yours to verify before you book.</p></div></div>
        <AnchorList anchors={orphanTransportAnchors} />
        {transportError && <p className="already-booked-note" role="alert">{transportError}</p>}
        {/* TWM-195 (MVP scope narrowing): Bookings Transport is gateway-only
            — transportLegList is already filtered to just the outbound-
            from-origin and return-to-origin rows (gatewayLegs), each its
            own explicit directional row, no round-trip bundling. Internal/
            circuit/local legs stay out of this list entirely. */}
        {transportLegList.map(leg => {
          const label = `${leg.from} → ${leg.to}`;
          const entry = transportData[legKey(leg)];
          const options = entry ? feasibleTransportOptions(entry.options, entry.feasibility) : [];
          const recommended = entry ? recommendedMode(options) : undefined;
          return (
            <BookingSegment
              key={leg.id}
              label={label}
              anchor={findAnchor(transportAnchors, label)}
              expanded={expandedBookingId === leg.id}
              onToggleExpand={() => toggleExpandedBooking(leg.id, 'transport')}
              loading={expandedBookingId === leg.id && bookingsStatus === 'loading'}
              loadError={expandedBookingId === leg.id ? transportError : null}
              options={options}
              recommended={recommended}
              feasibilityModes={entry?.feasibility?.modes}
              noOptionsMessage="No bookable transport options for this leg."
              renderOption={(option, best) => <TransportOptionCard key={option.mode} option={option} best={best} />}
              onOpenConfirm={() => openConfirmForm('transport', label)}
            />
          );
        })}
        {confirmType === 'transport' && (
          <ConfirmationForm dayOptions={dayNumbers} fields={confirmFields} setFields={setConfirmFields} onSubmit={submitConfirmForm} onCancel={() => setConfirmType(null)} pending={confirmPending} error={confirmError} />
        )}

        <div className="tab-intro"><div><h2>🏨 Stay</h2><p>Real properties for every base — check dates and price before booking.</p></div></div>
        <AnchorList anchors={orphanStayAnchors} />
        {stayError && <p className="already-booked-note" role="alert">{stayError}</p>}
        {stayLegList.map(stay => {
          const entry = stayData[stay.id];
          return (
            <BookingSegment
              key={stay.id}
              label={`${stay.location} · ${stay.nights} night${stay.nights === 1 ? '' : 's'}`}
              anchor={findAnchor(stayAnchors, `${stay.location} · ${stay.nights} night${stay.nights === 1 ? '' : 's'}`)}
              expanded={expandedBookingId === stay.id}
              onToggleExpand={() => toggleExpandedBooking(stay.id, 'stay')}
              loading={expandedBookingId === stay.id && bookingsStatus === 'loading'}
              loadError={expandedBookingId === stay.id ? stayError : null}
              options={entry?.options || []}
              // TWM-195 review comment: stay/hotel affiliate resolution is
              // out of scope for this slice — this is an honest "not yet
              // available" state, not "we searched and found nothing".
              noOptionsMessage="Stay booking isn't available here yet — check back once hotel partners are connected."
              renderOption={(option, best) => <StayOptionCard key={option.name} option={option} best={best} />}
              onOpenConfirm={() => openConfirmForm('stay', `${stay.location} · ${stay.nights} night${stay.nights === 1 ? '' : 's'}`)}
            />
          );
        })}
        {confirmType === 'stay' && (
          <ConfirmationForm dayOptions={dayNumbers} fields={confirmFields} setFields={setConfirmFields} onSubmit={submitConfirmForm} onCancel={() => setConfirmType(null)} pending={confirmPending} error={confirmError} />
        )}

        {activityList.length > 0 && (
          <>
            <div className="tab-intro"><div><h2>🎟️ Activity</h2><p>Only shown when advance booking is genuinely required — the exception, not the norm, for this trip.</p></div></div>
            <AnchorList anchors={orphanActivityAnchors} />
            {activityList.map(activity => (
              <ActivitySegment
                key={activity.id}
                activity={activity}
                anchor={findAnchor(activityAnchors, activity.title)}
                onOpenConfirm={() => openConfirmForm('activity', activity.title, activity.dayNumber)}
              />
            ))}
            {confirmType === 'activity' && (
              <ConfirmationForm dayOptions={dayNumbers} fields={confirmFields} setFields={setConfirmFields} onSubmit={submitConfirmForm} onCancel={() => setConfirmType(null)} pending={confirmPending} error={confirmError} />
            )}
          </>
        )}
      </section>}

      {tab === 'Support' && <section>
        <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with this specific itinerary.</p></div></div>
        <SupportContent intro="Swapping something, adjusting dates, or anything unclear about the plan you've already received — this is the place." />
      </section>}
    </main>
  );
}
