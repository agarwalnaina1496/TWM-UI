import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import TripHero from '../components/TripHero.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import SupportContent from '../components/SupportContent.jsx';
import { getItinerary, getTripBoard } from '../lib/tripApi.js';
import {
  anchorsForDay, bookingReadinessLabel, dayCostRange,
  verificationTone, trustStripCounts, bookingReadinessRollup,
  travelerCount,
} from '../lib/atlasView.js';
import {
  transportOptionsFor, feasibleTransportOptions,
  stayOptionsFor, modeLabel, recommendedMode,
  PARTNER_LABEL, MODES,
} from '../lib/bookingCatalog.js';
import { destinationFactRow, contextFactRows, dashboardPrimaryCta } from '../lib/dashboardTracks.js';
import { isTripEmpty } from '../lib/tripLifecycle.js';
import {
  tripOriginCity,
  tripBookingDateContext,
  tripTravelDatesMonthName,
  tripTravelerComposition,
  travelerCompositionTotal,
} from '../constants/tripContext.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../lib/useTripFromUrl.js';
import '../styles/dashboard.css';

// TWM-175: down from 7 tabs originally — Map folds into Overview's
// day-strip (it was never a real map, just route order). TWM-198: Docs
// parked/hidden for MVP — it only ever rendered an inert "Coming soon"
// placeholder with no real product decision behind it. TWM-206: Bookings
// retired too — Transport/Stay resolution and Set-dates now live inline on
// the Itinerary item itself (drawer or accordion, by information density),
// so a separate tab re-deriving the same legs was a parallel path to the
// same data, not a distinct feature.
const TABS = [
  { name: 'Overview', icon: '📊' },
  { name: 'Itinerary', icon: '📅' },
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

function dayHasStayInLocation(day, location) {
  return (day?.timeline || []).some(item => item.kind === 'STAY' && item.location === location);
}

function stayFromTimelineItem(item, days, dayNumber) {
  if (item.kind !== 'STAY' || !item.location) return null;
  const dayIndex = days.findIndex(day => day.day_number === dayNumber);
  let startIndex = dayIndex;
  let endIndex = dayIndex;
  while (startIndex > 0 && dayHasStayInLocation(days[startIndex - 1], item.location)) startIndex -= 1;
  while (endIndex < days.length - 1 && dayHasStayInLocation(days[endIndex + 1], item.location)) endIndex += 1;
  const groupedDays = dayIndex === -1 ? [dayNumber] : days.slice(startIndex, endIndex + 1).map(day => day.day_number);
  return {
    id: `stay-${groupedDays[0]}-${groupedDays[groupedDays.length - 1]}-${item.location}`,
    location: item.location,
    nights: groupedDays.length,
    dayNumbers: groupedDays,
  };
}

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

// TWM-201: small in-page flow for adding/updating booking-date precision on
// a frozen trip — mirrors the (TWM-198-removed) ConfirmationForm's scaffold (local field state,
// pending/error, Save/Cancel). Deliberately narrow (a mode toggle, one
// date/month input, and — PR review — an optional return date): origin_city,
// route, and num_travelers are never recollected here (out of scope), and
// the copy states the MVP boundary explicitly so a traveler never mistakes
// this for re-planning.
//
// returnValue (PR review, TWM-201): exact precision only. A gateway trip's
// outbound and return leg are booked independently (bookingCatalog.js's
// gatewayLegs); collecting a return date here lets Backend map it to the
// return leg specifically (TripBookingDateInput.return_date) instead of the
// UI ever reusing the outbound date for a return search. Optional — a
// traveler who only knows their departure date can still save with the
// return field empty, and the return leg simply gets no exact-date override
// (falls back to a flexible/indicative search, same as today).
// Precision of the month string already on file (if any), as [year, month]
// day-of-month bounds — used to keep the narrowed exact-date picker inside
// the month the traveler already told us, rather than opening a blank
// calendar that lets them pick a date outside it.
function monthDateBounds(monthValue) {
  if (!monthValue) return {};
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { min: `${monthValue}-01`, max: `${monthValue}-${String(lastDay).padStart(2, '0')}` };
}

// TWM-215 live-testing finding: the departure-date picker had no floor at
// all -- a traveler could pick and save a date that had already passed.
function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const MONTH_NAMES_LOWER = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// `existing` is the trip's current booking_dates context (tripBookingDateContext),
// not just this form's in-progress mode/value — the two are different on
// purpose. Once a precision is already on file, the exact/month radio choice
// is dropped entirely rather than shown redundantly: a traveler who already
// said "I know the month" is narrowing to an exact date within it, not
// re-answering "do you know the exact date or the month" from scratch, and
// showing both options again every time was confusing (TWM-215 live-testing
// finding). "Change month" is a deliberate, explicit escape hatch for a
// traveler whose plans genuinely shifted -- it re-opens the mode choice
// rather than leaving them stuck once precision is set once.
function DateEditForm({ existing, travelMonthHint, mode, setMode, value, setValue, returnValue, setReturnValue, onSubmit, onCancel, pending, error }) {
  const [changingPrecision, setChangingPrecision] = useState(false);
  const hasStructuredMonth = existing?.precision === 'month';
  // TWM-215 live-testing finding: a month the traveler already named in
  // trip_context.travel_dates (e.g. "December") is just as much a known
  // fact as a saved booking_dates month, even with no confirmed year --
  // asking "do you know the month?" again when they already said so reads
  // as not having listened. Both cases get the same narrowing treatment;
  // only the loose one can't bound the date picker to a real year.
  const hasLooseMonthOnly = !existing?.precision && Boolean(travelMonthHint);
  const hasKnownMonth = hasStructuredMonth || hasLooseMonthOnly;
  const knownMonthLabel = hasStructuredMonth ? existing.departure_month : travelMonthHint;
  const hasExistingPrecision = Boolean(existing?.precision) || hasLooseMonthOnly;
  const showModeChoice = !hasExistingPrecision || changingPrecision;
  const narrowingFromMonth = hasKnownMonth && !changingPrecision && mode === 'exact';

  function switchPrecision(nextMode) {
    setChangingPrecision(true);
    setMode(nextMode);
    setValue('');
    setReturnValue('');
  }

  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <p className="already-booked-note">
        Adding dates improves booking search precision only — it does not change your itinerary plan.
      </p>
      {showModeChoice ? (
        <div className="confirmation-form-actions" role="radiogroup" aria-label="Date precision">
          <label>
            <input type="radio" name="booking-date-mode" checked={mode === 'exact'} disabled={pending}
              onChange={() => switchPrecision('exact')} /> I know the exact date
          </label>
          <label>
            <input type="radio" name="booking-date-mode" checked={mode === 'month'} disabled={pending}
              onChange={() => switchPrecision('month')} /> I only know the month
          </label>
        </div>
      ) : (
        <p className="already-booked-note">
          {narrowingFromMonth ? `Narrowing down ${knownMonthLabel}. ` : ''}
          <button type="button" className="btn btn-ghost" disabled={pending}
            onClick={() => switchPrecision(mode === 'exact' ? 'month' : 'exact')}>
            {narrowingFromMonth
              ? (hasStructuredMonth ? 'Not in this month? Change month' : `Not in ${travelMonthHint}? Pick differently`)
              : 'Change precision'}
          </button>
        </p>
      )}
      {mode === 'exact' ? (
        <>
          <label>Departure date
            {(() => {
              const bounds = narrowingFromMonth && hasStructuredMonth ? monthDateBounds(existing.departure_month) : {};
              // Never let a saved month's own bounds re-open past dates --
              // the floor is always whichever is later, today or the
              // month's first day.
              const min = bounds.min && bounds.min > todayIsoDate() ? bounds.min : todayIsoDate();
              return (
                <input required type="date" value={value} disabled={pending}
                  min={min} max={bounds.max}
                  onChange={event => setValue(event.target.value)} />
              );
            })()}
          </label>
          <label>Return date (optional)
            <input type="date" value={returnValue} disabled={pending} min={value || todayIsoDate()} onChange={event => setReturnValue(event.target.value)} />
          </label>
        </>
      ) : (
        <label>Travel month
          <input required type="month" value={value} disabled={pending} min={todayIsoDate().slice(0, 7)} onChange={event => setValue(event.target.value)} />
        </label>
      )}
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending || !value}>Save dates</button>
      </div>
    </form>
  );
}

// TWM-213: mirrors DateEditForm's shape/pattern above — a trip-wide,
// Backend-owned fact edited through one small inline form, never guessed
// from a conversational count.
function TravelerEditForm({ adults, setAdults, children, setChildren, infants, setInfants, onSubmit, onCancel, pending, error }) {
  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <p className="already-booked-note">
        Exact traveler counts improve flight fare accuracy and stay/activity search — this does not change your itinerary plan.
      </p>
      <label>Adults
        <input required type="number" min={1} max={9} value={adults} disabled={pending}
          onChange={event => setAdults(Math.max(1, Number(event.target.value) || 1))} />
      </label>
      <label>Children
        <input type="number" min={0} max={8} value={children} disabled={pending}
          onChange={event => setChildren(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      <label>Infants
        <input type="number" min={0} max={8} value={infants} disabled={pending}
          onChange={event => setInfants(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>Save travelers</button>
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
// shows an inert note instead of linking to nothing.
// TWM-196: flight's CTA is always secondary (btn-ghost), regardless of
// `best` — the affiliate redirect must never visually outrank the API
// offer content above it (FlightLiveOfferInfo). Non-flight modes keep the
// existing best-pick emphasis.
function TrustedActionCta({ option, label, best, secondary = false }) {
  if (option.status === 'resolved' && option.url) {
    return (
      <a className={`btn ${best && !secondary ? 'btn-primary' : 'btn-ghost'}`} href={option.url} target="_blank" rel="noreferrer">{label}</a>
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

// Non-blocking nudge for month/flexible precision (TWM-196 UX review,
// TWM-201: now actionable). Never blocks rendering the card — a traveler
// with no confirmed date still sees a flexible/latest cached price, this
// only offers to improve on it.
function flightPrecisionNudgeLabel(datePrecision) {
  if (datePrecision === 'flexible') return 'Add travel month';
  if (datePrecision === 'month') return 'Add dates for exact fares';
  return null;
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
function FlightLiveOfferInfo({ liveOffer, onAddDates }) {
  if (!liveOffer) return null;
  const routeLabel = resolvedRouteLabel(liveOffer);
  const precisionLabel = DATE_PRECISION_LABEL[liveOffer.datePrecision] || null;
  const nudgeLabel = flightPrecisionNudgeLabel(liveOffer.datePrecision);
  const nudge = nudgeLabel && onAddDates && (
    <button type="button" className="stay-option-tag flight-precision-nudge" onClick={onAddDates}>
      {nudgeLabel}
    </button>
  );
  const routeContext = (routeLabel || precisionLabel) && (
    <div className="live-offer-route-context">
      {routeLabel && <span className="stay-option-tag">{routeLabel}</span>}
      {precisionLabel && <span className="stay-option-tag">{precisionLabel}</span>}
    </div>
  );
  if (liveOffer.status === 'offer' || liveOffer.status === 'partial') {
    // TWM-206: renders every ranked offer Backend returned, not just the
    // recommended one — the origin bug this story's discovery started
    // from (a real ranked list collapsed to a single ₹42,494 row before it
    // ever reached the card). `offers` is always populated by
    // bookingCatalog.js's toLiveOffer now; the single-liveOffer fallback
    // only guards a shape from before this fix.
    const offers = liveOffer.offers || [liveOffer];
    return (
      <div className="live-offer-block">
        {routeContext}
        {/* TWM-196 UX review: the Aviasales Data API is a cached lookup,
            never a confirmed-availability check — "Cached" here, never
            "Live"/"Confirmed", regardless of date precision. */}
        <StatusPill tone="neutral" variant="filled">
          {liveOffer.status === 'partial' ? 'Cached price (partial)' : 'Cached price'}
        </StatusPill>
        <div className="live-offer-list">
          {offers.map((offer, index) => {
            const freshness = timeAgoLabel(offer.priceFoundAt);
            const departureTime = flightDepartureTimeLabel(offer.departureAt);
            return (
              <div className={`live-offer-row${offer.isRecommended ? ' recommended' : ''}`} key={index}>
                {offer.isRecommended && offers.length > 1 && <span className="pick-badge">Our pick</span>}
                <strong className="live-offer-price">{offer.priceLabel}</strong>
                <span className="stay-option-tag">
                  {offer.airline || 'Airline not disclosed'}
                  {offer.flightNumber && ` ${offer.flightNumber}`}
                  {offer.stopCount != null && ` · ${offer.stopCount === 0 ? 'Nonstop' : `${offer.stopCount} stop${offer.stopCount === 1 ? '' : 's'}`}`}
                </span>
                {departureTime && <span className="stay-option-tag">Departs {departureTime}</span>}
                {freshness && <span className="stay-option-tag">Updated {freshness}</span>}
                {offer.offerExpiresAt && <span className="stay-option-tag">Expires {new Date(offer.offerExpiresAt).toLocaleString()}</span>}
              </div>
            );
          })}
        </div>
        <p className="already-booked-note">Not yet confirmed available — check availability before booking.</p>
        {nudge}
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
        {nudge}
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

function TransportOptionCard({ option, best, onAddDates }) {
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
      {isFlight && <FlightLiveOfferInfo liveOffer={option.liveOffer} onAddDates={onAddDates} />}
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
      <TrustedActionCta option={option} label="Check ↗" best />
    </article>
  );
}

// TWM-213 UX rework: trip dates and traveler composition are both
// trip-wide, booking-precision facts that only matter at the moment of an
// actual search — the least-friction, most familiar pattern (every OTA
// site's search bar sitting atop its results) is a single editable summary
// strip at the top of wherever that search happens, prefilled with
// whatever's already saved, not a separate affordance the traveler has to
// find beforehand. Both labels say "Trip" explicitly (not "this leg" or
// "this stay") since editing either one always changes the same shared
// trip-wide value regardless of which drawer it's opened from — Stay's
// own derived check-in date is a separate, clearly-labeled read-only line
// the StayDrawer renders above this strip, never conflated with it.
function BookingSummaryStrip({
  dateLabel, onEditDate, dateEditOpen, dateEditForm,
  travelerLabel, onEditTravelers, travelerEditOpen, travelerEditForm,
}) {
  return (
    <div className="booking-summary-strip">
      <div className="booking-summary-row">
        <button type="button" className="btn btn-ghost btn-small" onClick={onEditDate}>
          📅 {dateLabel ? `Trip dates: ${dateLabel} · Change` : 'Set trip dates'}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onEditTravelers}>
          👤 {travelerLabel ? `Trip ${travelerLabel} · Change` : 'Set trip travelers'}
        </button>
      </div>
      {dateEditOpen && dateEditForm}
      {travelerEditOpen && travelerEditForm}
    </div>
  );
}

// Itinerary tab. Dims the Itinerary behind it (transport-drawer-overlay);
// never navigates away, never a full-screen modal.
// TWM-215: a small, search-scoped traveler-count control — separate from
// the trip-wide BookingSummaryStrip traveler editor above, which changes
// traveler_composition itself. "Search for" here never touches that field;
// it only decides what count this one leg's search asks for (e.g. a subset
// of the group flying this leg while the rest book separately).
function TransportTravelerOverride({ defaultTravelerCount, travelerOverride, onSearch, disabled }) {
  const [draft, setDraft] = useState(travelerOverride ?? defaultTravelerCount ?? 1);
  const activeCount = travelerOverride ?? defaultTravelerCount;
  return (
    <div className="transport-traveler-override">
      <label>
        Search for
        <input type="number" min={1} max={9} value={draft} disabled={disabled}
          onChange={event => setDraft(Math.max(1, Number(event.target.value) || 1))} />
        traveler{draft === 1 ? '' : 's'}
      </label>
      <button type="button" className="btn btn-ghost" disabled={disabled || draft === activeCount}
        onClick={() => onSearch(draft)}>
        Search
      </button>
      {travelerOverride && travelerOverride !== defaultTravelerCount && (
        <button type="button" className="btn btn-ghost" disabled={disabled}
          onClick={() => { setDraft(defaultTravelerCount ?? 1); onSearch(null); }}>
          Reset to {defaultTravelerCount ?? 'trip'} default
        </button>
      )}
    </div>
  );
}

// TWM-215: travelerOverride/onSearchTravelerCount let a traveler search this
// one leg for a different party size than the trip-wide default — e.g. only
// 3 of 4 travelers are on this specific gateway leg. This is a search-time
// override only: it never writes trip_context/traveler_composition, and
// resets whenever the drawer re-opens for a leg (see openTransportDrawer).
function TransportDrawer({ leg, options, feasibility, loading, error, summaryStrip, defaultTravelerCount, travelerOverride, onSearchTravelerCount, onClose }) {
  if (!leg) return null;
  const resolvedOptions = feasibleTransportOptions(options || [], feasibility);
  const feasibleModeNames = new Set((feasibility?.modes || []).map(entry => entry.mode));
  // TWM-195 root-fix contract: Backend's `modes` list only ever contains
  // genuinely feasible entries — there is no per-mode reason for an absent
  // mode, so this section can only say a mode isn't available, never why.
  const notFeasibleModes = MODES.filter(mode => !feasibleModeNames.has(mode));
  const recommended = resolvedOptions.length ? recommendedMode(resolvedOptions) : undefined;
  return (
    <div className="transport-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="transport-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Transport: ${leg.from} to ${leg.to}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="transport-drawer-head">
          <h3>{leg.from} → {leg.to}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close transport options">✕</button>
        </div>
        {summaryStrip}
        {onSearchTravelerCount && (
          <TransportTravelerOverride
            defaultTravelerCount={defaultTravelerCount}
            travelerOverride={travelerOverride}
            onSearch={onSearchTravelerCount}
            disabled={loading}
          />
        )}
        {loading && <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>}
        {error && <p className="already-booked-note" role="alert">{error}</p>}
        {!loading && !error && (
          <>
            {resolvedOptions.length === 0 ? (
              <p className="already-booked-note" role="status">No bookable transport options for this leg.</p>
            ) : (
              <>
                {recommended && <RecommendedModeCard option={recommended} />}
                <div className="stay-options-grid">
                  {resolvedOptions.map(option => (
                    <TransportOptionCard key={option.mode} option={option} best={recommended ? option === recommended : false} />
                  ))}
                </div>
              </>
            )}
            {notFeasibleModes.length > 0 && (
              <details className="transport-drawer-not-feasible">
                <summary>Other modes ({notFeasibleModes.length} not available for this route)</summary>
                <ul className="trip-notes-list">
                  {notFeasibleModes.map(mode => (
                    <li key={mode}><ModeTag mode={mode} /> Not available for this route.</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

const STAY_TIER_LABEL = { budget: 'Budget', mid_range: 'Mid-range', premium: 'Premium' };

// TWM-206: the Stay drawer — link-only cards per approved partner
// (hotellook/booking_com/agoda per bookingCatalog.js's STAY_PARTNERS), no
// fabricated price/rating on the card itself. Atlas's TWM-204 per-tier
// estimate (stay_price_estimate, already present on the raw day object —
// no Trip Board adapter change needed since it isn't feasibility-derived)
// renders as its own clearly-labeled non-binding section, never merged
// into or presented as a partner's real price.
function StayDrawer({ stay, options, loading, error, stayPriceEstimate, summaryStrip, onClose }) {
  if (!stay) return null;
  return (
    <div className="transport-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="transport-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Stay: ${stay.location}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="transport-drawer-head">
          <h3>{stay.location} · {stay.nights} night{stay.nights === 1 ? '' : 's'}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close stay options">✕</button>
        </div>
        {/* This stay's own check-in date, derived from day_number — never
            the same value as the gateway travel date, and never editable
            from here (see BookingSummaryStrip's comment above). */}
        {stay.departureDate ? (
          <p className="transport-drawer-date">📅 Check-in {stay.departureDate}</p>
        ) : (
          <p className="transport-drawer-date-note">Set exact trip dates via a Transport search for a precise check-in date.</p>
        )}
        {summaryStrip}
        {stayPriceEstimate && (
          <div className="stay-estimate-block">
            <span className="stay-estimate-label">Non-binding estimate, per night</span>
            <div className="stay-estimate-tiers">
              {stayPriceEstimate.map(tier => (
                <div className="stay-estimate-tier" key={tier.tier}>
                  <span className="stay-option-tag">{STAY_TIER_LABEL[tier.tier] || tier.tier}</span>
                  <strong>{moneyRange(tier.estimated_cost_low, tier.estimated_cost_high)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
        {loading && <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>}
        {error && <p className="already-booked-note" role="alert">{error}</p>}
        {!loading && !error && (
          options?.length ? (
            <div className="stay-options-grid">
              {options.map(option => (
                // PR review: partner order (hotellook/booking_com/agoda) has
                // no price/rating basis to prefer one — a "best" pick here
                // would be a fabricated ranking indicator, contradicting
                // this drawer's own no-fabricated-price/rating principle.
                <StayOptionCard key={option.name} option={option} best={false} />
              ))}
            </div>
          ) : (
            <p className="already-booked-note" role="status">No stay partners available for this location.</p>
          )
        )}
      </aside>
    </div>
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

// TWM-206: BookingSegment/ActivitySegment (the Bookings-tab-only "Resolve ▾"
// inline-expansion pattern) were retired along with the Bookings tab itself —
// Transport/Stay resolution now happens via the Itinerary item's own
// drawer/inline affordances (TransportDrawer/StayDrawer/DateEditForm below),
// and a day's AnchorList already surfaces its own confirmed anchors without
// a separate per-segment confirmed-card duplicate.

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

  // TWM-201: booking-date update flow — trip-wide (it saves one trip-level
  // precision, not a per-leg fact). A save failure never clears/hides the
  // flight cards already rendered from the last successful resolution
  // (acceptance criteria); it only surfaces inline in the form itself.
  const [dateEditOpen, setDateEditOpen] = useState(false);
  const [dateEditMode, setDateEditMode] = useState('exact');
  const [dateEditValue, setDateEditValue] = useState('');
  const [dateEditReturnValue, setDateEditReturnValue] = useState('');
  const [dateEditPending, setDateEditPending] = useState(false);
  const [dateEditError, setDateEditError] = useState(null);

  // TWM-213: traveler-composition update flow — same shape/pattern as the
  // booking-date flow above (trip-wide, Backend-owned, a save failure never
  // clears already-resolved options). One control, not per-item, since
  // composition has no per-leg concept.
  const [travelerEditOpen, setTravelerEditOpen] = useState(false);
  const [travelerEditAdults, setTravelerEditAdults] = useState(1);
  const [travelerEditChildren, setTravelerEditChildren] = useState(0);
  const [travelerEditInfants, setTravelerEditInfants] = useState(0);
  const [travelerEditPending, setTravelerEditPending] = useState(false);
  const [travelerEditError, setTravelerEditError] = useState(null);

  // TWM-206: the Transport drawer opened inline from a gateway leg in the
  // Itinerary tab. Resolves on demand (only when a drawer actually opens),
  // caching into transportData so a second open of the same leg never
  // refetches.
  const [transportDrawerLeg, setTransportDrawerLeg] = useState(null);
  const [transportDrawerLoading, setTransportDrawerLoading] = useState(false);
  const [transportDrawerError, setTransportDrawerError] = useState(null);
  // TWM-215: a traveler count for THIS search only, independent of the
  // trip-wide travelerComposition — e.g. 3 of the 4 travelers are flying
  // this specific gateway leg together while the 4th books separately.
  // Never written back to trip_context/traveler_composition; it only
  // changes which options this one drawer's search asks for.
  const [transportDrawerTravelerOverride, setTransportDrawerTravelerOverride] = useState(null);

  // TWM-206/TWM-211: the Stay drawer, same on-demand/cached pattern as
  // Transport's above — opened from the actual STAY timeline item, resolved
  // only when actually opened.
  const [stayDrawerStay, setStayDrawerStay] = useState(null);
  const [stayDrawerLoading, setStayDrawerLoading] = useState(false);
  const [stayDrawerError, setStayDrawerError] = useState(null);

  // TWM-132: transportOptionsFor/stayOptionsFor (TWM-130/131's trusted-action
  // + feasibility endpoints) are real network calls, resolved on demand by
  // the drawer-open functions below rather than eagerly for every leg/stay.
  // Keyed by a leg's "from→to" string (transportData) or a stay's id
  // (stayData) so lookups don't depend on any synthetic bundle id.
  const [transportData, setTransportData] = useState({});
  const [stayData, setStayData] = useState({});
  // TWM-202/TWM-206: the Trip Board adapter's response — gateway-leg
  // identification, feasibility, and date-precision per item come from
  // here, computed once server-side, instead of this layer re-deriving
  // gatewayLegs/transportLegs client-side and firing a separate feasibility
  // call per leg.
  const [boardData, setBoardData] = useState(null);
  // PR review: version alone isn't enough to prove boardData matches the
  // current itineraryResult -- a freshly-generated trip always starts at
  // itinerary version 1, so switching trips in-app (viewTrip on a
  // ?tripId= change, without unmounting) could otherwise pass a stale
  // same-version check with a *different* trip's board data for one
  // render. Tracked alongside boardData so both are always read together.
  const [boardDataTripId, setBoardDataTripId] = useState(null);
  const boardFetchStarted = useRef(null); // `${tripId}:${itineraryResult.version}:${originCity}:${bookingDates}` currently/last fetched, or null

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

  // TWM-206: fetches the Trip Board once the itinerary is ready — Itinerary's
  // inline Set-dates/Transport-options/Stay-options affordances all need
  // is_gateway_leg/date_precision/feasible_modes per item. Deliberately
  // lightweight (one GET, no per-mode/per-partner resolution) — actual
  // transport/stay option resolution happens on demand in
  // openTransportDrawer/openStayDrawer below, only for whichever leg/stay
  // the traveler actually opens.
  useEffect(() => {
    if (itineraryStatus !== 'ready' || !tripId || !itineraryResult) return;
    const bookingDateContext = tripBookingDateContext(tripState?.trip_context);
    const boardFetchKey = `${tripId}:${itineraryResult.version}:${tripOriginCity(tripState?.trip_context) ?? ''}:${bookingDateContext ? `${bookingDateContext.precision}:${bookingDateContext.departure_date || bookingDateContext.departure_month || ''}:${bookingDateContext.return_date || ''}` : ''}`;
    if (boardFetchStarted.current === boardFetchKey) return;
    boardFetchStarted.current = boardFetchKey;
    let cancelled = false;
    getTripBoard(tripId).then(board => {
      if (cancelled) return;
      setBoardData(board);
      setBoardDataTripId(tripId);
    }).catch(() => {
      // No dedicated error surface for this light fetch — Itinerary's
      // Set-dates/Transport-options affordances simply won't render for a
      // gateway leg without it.
    });
    return () => { cancelled = true; };
    // PR review, TWM-206: trip_context.booking_dates must be a dependency,
    // not just part of the ref-keyed guard inside — an effect only
    // re-fires when a listed dependency actually changes, so a
    // booking-date save (which changes booking_dates but not origin_city)
    // was silently never triggering a refetch until an unrelated
    // dependency also changed or the page reloaded.
  }, [itineraryStatus, tripId, itineraryResult, tripState?.trip_context?.origin_city, tripState?.trip_context?.booking_dates]);

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

  // TWM-215 live-testing finding: saving a booking date while the Transport
  // drawer stays open (the whole point of editing it inline via
  // BookingSummaryStrip, never requiring a close/reopen) cleared
  // transportData's cache (submitDateEdit's setTransportData({})) but
  // nothing then refetched for the still-open leg -- the drawer was left
  // permanently showing "No bookable transport options for this leg" /
  // every mode "not available", since options/feasibility both read as
  // undefined forever with no other trigger to re-fetch them. Mirrors
  // openTransportDrawer's own fetch, just reactive instead of click-only,
  // recomputing the board item straight from boardData (not the render-time
  // boardDayByNumber/freshLeg below, which aren't in scope yet this early
  // and can't be referenced before an early return without breaking the
  // Rules of Hooks).
  useEffect(() => {
    if (!transportDrawerLeg) return;
    if (boardData?.version !== itineraryResult?.version || boardDataTripId !== tripId) return;
    const boardItem = (boardData?.days || [])
      .flatMap(day => day.items || [])
      .find(item => item.is_gateway_leg && item.from_city === transportDrawerLeg.from && item.to_city === transportDrawerLeg.to);
    if (!boardItem) return;
    const key = transportCacheKey(transportDrawerLeg, transportDrawerTravelerOverride);
    if (transportData[key] || transportDrawerLoading) return;
    fetchTransportOptions(transportDrawerLeg, boardItem, transportDrawerTravelerOverride);
  }, [transportDrawerLeg, boardData, boardDataTripId, itineraryResult, tripId, transportDrawerTravelerOverride, transportData, transportDrawerLoading]);

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

  // TWM-213: no longer keyed per-item — booking_dates is trip-wide and now
  // only ever edited from the Transport/Stay drawer's summary strip, so a
  // single open/closed flag is enough (only one drawer, hence one strip,
  // is ever open at a time).
  function openDateEditForm(suggestedMode) {
    const existing = tripBookingDateContext(tripState?.trip_context);
    // TWM-215: always opens narrowing to an exact date -- DateEditForm's
    // own hasKnownMonth check (structured booking_dates.precision==='month'
    // OR a loose month already named in trip_context.travel_dates) decides
    // whether that renders as "pick a day inside this month" or fresh
    // mode-choice radios; it never needs the "I only know the month" radio
    // pre-selected just because a month is already known -- re-asking
    // "do you know the month?" when the traveler already said so reads as
    // not having listened.
    const mode = suggestedMode === 'month' ? 'month' : 'exact';
    setDateEditMode(mode);
    // PR review: seed from whatever's already saved, when it matches the
    // mode being opened, instead of always clearing -- the trigger button
    // already advertises the saved value ("<date> · Change dates"), so
    // "Change" starting blank forced retyping the departure date from
    // memory just to add/edit a return date. Only starts blank when
    // there's genuinely nothing saved yet, or the traveler is switching
    // precision (exact <-> month has no shared field to seed from).
    const travelMonthName = tripTravelDatesMonthName(tripState?.trip_context);
    if (existing?.precision === mode) {
      setDateEditValue((mode === 'exact' ? existing.departure_date : existing.departure_month) || '');
      setDateEditReturnValue((mode === 'exact' ? existing.return_date : '') || '');
    } else if (mode === 'exact' && !existing?.precision && travelMonthName) {
      // TWM-215: no booking_dates yet, but travel_dates already named a
      // month -- seed a same-year, first-of-month suggestion rather than
      // opening blank. This is only ever a starting suggestion in a live,
      // freely-editable date picker: the traveler can navigate to any
      // other date/year before Save, so defaulting the year doesn't
      // fabricate a confirmed fact the way Atlas's own structured output
      // must avoid -- nothing is recorded until they explicitly submit it.
      const monthIndex = MONTH_NAMES_LOWER.indexOf(travelMonthName.toLowerCase());
      const year = new Date().getFullYear();
      setDateEditValue(`${year}-${String(monthIndex + 1).padStart(2, '0')}-01`);
      setDateEditReturnValue('');
    } else {
      setDateEditValue('');
      setDateEditReturnValue('');
    }
    setDateEditError(null);
    setDateEditOpen(true);
  }

  async function submitDateEdit(event) {
    event.preventDefault();
    setDateEditPending(true);
    setDateEditError(null);
    try {
      await sendTripCommand('update_booking_dates', {
        bookingDateUpdate: dateEditMode === 'exact'
          ? { departure_date: dateEditValue, ...(dateEditReturnValue ? { return_date: dateEditReturnValue } : {}) }
          : { departure_month: dateEditValue },
      });
      trackEvent('booking_dates_updated', { precision: dateEditMode });
      // PR review: legKey has no date component, so an already-cached
      // Transport drawer entry would otherwise keep serving pre-save
      // (flexible/month-precision) options after the date changes. The
      // date is trip-wide, not per-leg, so every cached entry is
      // invalidated — the board-fetch effect's own booking_dates
      // dependency already re-fetches boardData for the new precision.
      setTransportData({});
      setDateEditOpen(false);
    } catch (error) {
      setDateEditError(error.message || 'Could not save those dates — your existing flight options are still available.');
    } finally {
      setDateEditPending(false);
    }
  }

  function openTravelerEditForm() {
    const existing = tripTravelerComposition(tripState?.trip_context);
    setTravelerEditAdults(existing?.adults ?? 1);
    setTravelerEditChildren(existing?.children ?? 0);
    setTravelerEditInfants(existing?.infants ?? 0);
    setTravelerEditError(null);
    setTravelerEditOpen(true);
  }

  async function submitTravelerEdit(event) {
    event.preventDefault();
    setTravelerEditPending(true);
    setTravelerEditError(null);
    try {
      await sendTripCommand('update_traveler_composition', {
        travelerCompositionUpdate: {
          adults: travelerEditAdults,
          children: travelerEditChildren,
          infants: travelerEditInfants,
        },
      });
      trackEvent('traveler_composition_updated', {
        adults: travelerEditAdults,
        children: travelerEditChildren,
        infants: travelerEditInfants,
      });
      // Same invalidation rule as submitDateEdit above: composition is
      // trip-wide, so every cached Transport/Stay entry (built with the
      // old count) must be dropped rather than kept stale.
      setTransportData({});
      setStayData({});
      setTravelerEditOpen(false);
    } catch (error) {
      setTravelerEditError(error.message || 'Could not save traveler composition — your existing options are still available.');
    } finally {
      setTravelerEditPending(false);
    }
  }

  function resolveBookingPrompt(destination) {
    trackEvent('booking_prompt_choice', { choice: destination });
    setShowBookingPrompt(false);
    // TWM-206: 'bookings' names the analytics choice, not a tab anymore —
    // Bookings was retired, so "sort out bookings now" lands on Itinerary,
    // where Transport/Stay resolution and Set-dates now actually live.
    if (destination === 'bookings') setTab('Itinerary');
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
  // TWM-206: board items mirror Atlas's own timeline order 1:1 per day
  // (twm/services/trip_board/service.py builds them by iterating the same
  // day.timeline), so a plain index lookup is enough to find the matching
  // board item's is_gateway_leg/feasible_modes/date_precision for a given
  // Atlas timeline item — no from_city/to_city re-matching needed here.
  // PR review: that index-matching assumption only holds when boardData
  // was fetched for this exact itinerary revision — boardData resolves
  // asynchronously and can still lag one render behind a just-landed
  // itineraryResult (new version renders immediately; the matching board
  // fetch hasn't resolved yet), so an item-count/order change in that
  // revision could otherwise silently attach a stale board item to the
  // wrong new timeline item. Falls back to no board-derived affordances
  // (identical to the no-boardData-yet state) until the versions agree.
  // PR review: version alone doesn't rule out a cross-trip mismatch after
  // switching trips in-app (fresh trips all start at version 1) — gate on
  // boardDataTripId too.
  const boardDayByNumber = boardData?.version === itineraryResult.version && boardDataTripId === tripId
    ? Object.fromEntries((boardData.days || []).map(day => [day.day_number, day]))
    : {};
  // TWM-146/TWM-195/TWM-199: same canonical-then-fallback source the
  // Bookings-tab fetch effect uses, so the Transport drawer's on-demand
  // resolution never sends a different traveler_count than an eager
  // Bookings-tab fetch would have.
  const travelerComposition = tripTravelerComposition(tripState?.trip_context);
  const partySize = travelerCompositionTotal(travelerComposition);
  // TWM-213: three states, not two. Composition (exact, booking-usable) is
  // the primary label when set. Otherwise fall back to the loose
  // conversational num_travelers (Meridian/Guide already ask this during
  // Discover/Plan) shown honestly as an approximation, not hidden as if
  // nothing were known — but never sent in a real booking payload, only
  // travelerComposition ever is. Only when neither exists does the label
  // fall through to the drawer's "Set travelers" empty state.
  //
  // PR review: Atlas's own resolved trip_summary.num_travelers, not a
  // client-side parse of the raw trip_context string — tripTravelerCount's
  // numeric-only parsing silently dropped a real, meaningful conversational
  // answer like "couple" or "family of 4" (Number("couple") is NaN), making
  // a genuinely-known rough fact look like nothing was known at all. Atlas
  // already resolves that same qualitative answer into a real number
  // (recording the assumption in assumptions[]), so once an itinerary
  // exists it's the trustworthy fallback, not the raw string.
  const roughTravelerCount = travelerCount(finalItinerary.trip_summary);
  const travelerDisplayLabel = partySize
    ? `${partySize} travelers`
    : roughTravelerCount
    ? `~${roughTravelerCount} travelers (approx)`
    : null;

  // TWM-215: transportData's cache key includes the traveler count a search
  // actually used, not just the route — so a per-leg override (see
  // transportDrawerTravelerOverride) fetches and caches independently of the
  // trip-wide default search for the same leg, and switching the override
  // back and forth never serves a stale count's results as if they matched.
  function transportCacheKey(leg, travelerCountForSearch) {
    return `${legKey(leg)}::${travelerCountForSearch ?? 'default'}`;
  }

  // TWM-206/TWM-215: fetches (or serves from cache) a leg's transport
  // options for a specific traveler count — the trip-wide default when
  // travelerCountForSearch is null, or a per-search override otherwise (e.g.
  // 3 of 4 travelers flying this leg together while the 4th books apart).
  async function fetchTransportOptions(leg, boardItem, travelerCountForSearch) {
    const key = transportCacheKey(leg, travelerCountForSearch);
    setTransportDrawerError(null);
    if (transportData[key]) return;
    setTransportDrawerLoading(true);
    try {
      const feasibility = { modes: boardItem.feasible_modes || [] };
      const approvedModes = feasibility.modes.map(entry => entry.mode);
      const composition = travelerCountForSearch
        ? { adults: travelerCountForSearch, children: 0, infants: 0 }
        : travelerComposition;
      const options = await transportOptionsFor(tripId, leg, composition, approvedModes);
      setTransportData(prev => ({ ...prev, [key]: { options, feasibility } }));
    } catch (error) {
      setTransportDrawerError(error.message || 'Could not load transport options.');
    } finally {
      setTransportDrawerLoading(false);
    }
  }

  // TWM-206/TWM-215: opens the Transport drawer for a gateway leg. This only
  // ever sets which leg is open -- it deliberately never calls
  // fetchTransportOptions itself. The reactive effect above is the single
  // place in the codebase that decides "does the currently-open leg need a
  // fetch right now", covering every way that answer can become yes
  // (opening a leg for the first time, a booking-date save invalidating the
  // cache, a traveler-search-override changing) through one path instead of
  // several imperative call sites that could each independently forget to
  // trigger one -- which is exactly how the booking-date-save case was
  // missed before (TWM-215 live-testing finding: saving dates without
  // closing the drawer left it permanently showing no options, since only
  // the click-to-open path used to fetch).
  function openTransportDrawer(boardItem) {
    const leg = {
      from: boardItem.from_city,
      to: boardItem.to_city,
      departureDate: boardItem.date_precision === 'exact' ? boardItem.departure_date : null,
      departureMonth: boardItem.date_precision === 'month' ? boardItem.departure_month : null,
    };
    setTransportDrawerLeg(leg);
    // PR review: reset before the effect's own cache-hit check runs, not
    // just before a real fetch — onClose never clears these, so a stale
    // error/loading state from a previously failed leg would otherwise
    // still be showing when a different, already-cached leg opens next.
    setTransportDrawerError(null);
    setTransportDrawerLoading(false);
    setTransportDrawerTravelerOverride(null);
  }

  // TWM-215: re-searches the currently open leg for a different traveler
  // count than the trip-wide default, without ever writing that count back
  // to trip_context/traveler_composition — this is a search-only override,
  // scoped to this one drawer visit. Only sets state; the effect above
  // notices the override changed and fetches for it.
  function searchTransportForTravelerCount(travelerCountForSearch) {
    setTransportDrawerTravelerOverride(travelerCountForSearch);
  }

  // TWM-211: opens the Stay drawer for the actual STAY timeline item, not
  // the day's primary_location-derived route stop. A day can be spent in
  // one city and overnight in another.
  //
  // Resolves partner options on demand the first time (cached into stayData
  // so a second open never refetches the same stay item).
  async function openStayDrawer(stay) {
    setStayDrawerStay(stay);
    // PR review: same reset-before-cache-hit fix as openTransportDrawer.
    setStayDrawerError(null);
    setStayDrawerLoading(false);
    if (stayData[stay.id]) return;
    setStayDrawerLoading(true);
    try {
      const options = await stayOptionsFor(tripId, stay, travelerComposition);
      setStayData(prev => ({ ...prev, [stay.id]: { options } }));
    } catch (error) {
      setStayDrawerError(error.message || 'Could not load stay options.');
    } finally {
      setStayDrawerLoading(false);
    }
  }

  const allCosts = days.flatMap(day => { const range = dayCostRange(day); return [range.low, range.high]; });
  const costMin = Math.min(...allCosts, 0);
  const costMax = Math.max(...allCosts, 1);
  const proposedRevision = itineraryState.proposed_revision;
  const trustCounts = trustStripCounts(finalItinerary, result);
  const readiness = bookingReadinessRollup(days, anchors, tripId);
  // TWM-198: a confirmed logistics anchor whose day_number no longer
  // exists in the current itinerary (e.g. after a regeneration that
  // changed the day count/structure) never matches anchorsForDay on any
  // day any more — TWM-206 retired the Bookings tab's generic
  // orphanTransportAnchors/orphanStayAnchors/orphanActivityAnchors
  // catch-all along with the tab itself, so this is the only remaining
  // surface a genuinely orphaned anchor gets, rather than becoming
  // silently invisible. Day-number membership (not the old label-string
  // match) is the check here: anchors have no stable id to re-match
  // against a computed segment, but day-number existence is a simple,
  // robust proxy for "does this confirmation still belong somewhere."
  const currentDayNumbers = new Set(days.map(day => day.day_number));
  const orphanAnchors = anchors.filter(anchor => !currentDayNumbers.has(anchor.day_number));

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
          {/* TWM-198: Share hidden for MVP rather than left as an
              alert-only fake action — no real share capability exists yet.
              PDF is unchanged here; it's tracked separately (TWM-98). */}
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
            <button type="button" className="btn btn-ghost" onClick={() => setTab('Itinerary')}>Resolve bookings →</button>
          )}
        </div>

        {orphanAnchors.length > 0 && (
          <div className="tab-intro"><div>
            <h2>Other confirmed items</h2>
            <p>Confirmed earlier, from a day this itinerary no longer has — still on file.</p>
          </div></div>
        )}
        <AnchorList anchors={orphanAnchors} />

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
              {selectedDay.timeline.map((item, index) => {
                const boardItem = boardDayByNumber[selectedDay.day_number]?.items?.[index];
                const isGatewayLeg = item.kind === 'TRAVEL' && boardItem?.is_gateway_leg;
                const stayItem = stayFromTimelineItem(item, days, selectedDay.day_number);
                if (stayItem) {
                  stayItem.departureDate = boardDayByNumber[stayItem.dayNumbers[0]]?.date ?? null;
                }
                const hasItemActions = isGatewayLeg || stayItem;
                return (
                  <div className="atlas-item" key={index}>
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
                      {/* TWM-213 UX rework: dates and traveler composition
                          are no longer set inline on the Itinerary item —
                          both are trip-wide, booking-precision facts that
                          only matter at the moment of an actual search, so
                          they're now an editable summary strip at the top
                          of the Transport/Stay drawer itself (where the
                          search happens), not a separate affordance the
                          traveler has to find beforehand. This block is
                          just the two drawer triggers. */}
                      {hasItemActions && (
                        <div className="itinerary-set-dates">
                          {stayItem && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => openStayDrawer(stayItem)}
                            >
                              🏨 Stay options ▾
                            </button>
                          )}
                          {isGatewayLeg && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => openTransportDrawer(boardItem)}
                            >
                              🚗 Transport options ▾
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
                  {(selectedDay.notes || []).map((note, index) => (
                    <li key={index}>
                      <span>•</span>
                      <span><strong>{note.title}</strong> — {note.detail} <VerificationTag status={note.reference?.status} /></span>
                    </li>
                  ))}
                  {selectedDay.backup_plan && <li><span>🔁</span>{selectedDay.backup_plan}</li>}
                </ul>
              </div>
            </div>
          </article>
        </div>
      </section>}

      {(() => {
        const bookingDateContext = tripBookingDateContext(tripState?.trip_context);
        // PR review: the strip must show the date this specific search will
        // actually use, not always the trip's raw departure_date — an
        // inbound/return gateway leg searches with return_date (the Board
        // already resolves this per-item, see openTransportDrawer's `leg`),
        // so its drawer's label has to reflect that too, or it would show
        // the outbound date while silently searching with a different one.
        // Stay has no outbound/inbound concept, so it always shows the
        // trip's raw departure/month label.
        const renderStrip = (dateLabel, dateModeHint) => (
          <BookingSummaryStrip
            dateLabel={dateLabel}
            // TWM-215: always opens narrowing to an exact date, even when a
            // month is already on file — DateEditForm's own hasExistingPrecision
            // check is what decides whether that renders as "pick a day
            // inside this month" (existing) or fresh mode-choice radios
            // (nothing known yet); dateModeHint only drives dateLabel above.
            onEditDate={() => openDateEditForm('exact')}
            dateEditOpen={dateEditOpen}
            dateEditForm={
              <DateEditForm
                existing={bookingDateContext}
                travelMonthHint={tripTravelDatesMonthName(tripState?.trip_context)}
                mode={dateEditMode}
                setMode={setDateEditMode}
                value={dateEditValue}
                setValue={setDateEditValue}
                returnValue={dateEditReturnValue}
                setReturnValue={setDateEditReturnValue}
                onSubmit={submitDateEdit}
                onCancel={() => setDateEditOpen(false)}
                pending={dateEditPending}
                error={dateEditError}
              />
            }
            travelerLabel={travelerDisplayLabel}
            onEditTravelers={openTravelerEditForm}
            travelerEditOpen={travelerEditOpen}
            travelerEditForm={
              <TravelerEditForm
                adults={travelerEditAdults}
                setAdults={setTravelerEditAdults}
                children={travelerEditChildren}
                setChildren={setTravelerEditChildren}
                infants={travelerEditInfants}
                setInfants={setTravelerEditInfants}
                onSubmit={submitTravelerEdit}
                onCancel={() => setTravelerEditOpen(false)}
                pending={travelerEditPending}
                error={travelerEditError}
              />
            }
          />
        );
        const genericDateLabel = bookingDateContext?.precision === 'exact'
          ? bookingDateContext.departure_date
          : bookingDateContext?.precision === 'month'
          ? bookingDateContext.departure_month
          : null;
        // PR review: transportDrawerLeg is a snapshot captured once when the
        // drawer opened -- re-deriving its date from boardDayByNumber (fresh
        // every render) instead of trusting that snapshot is what makes a
        // date saved while the drawer is open actually show up on the strip,
        // rather than the stale value from open-time.
        const freshLeg = transportDrawerLeg
          ? Object.values(boardDayByNumber)
              .flatMap(day => day.items || [])
              .find(item => item.is_gateway_leg && item.from_city === transportDrawerLeg.from && item.to_city === transportDrawerLeg.to)
          : null;
        const transportStrip = transportDrawerLeg
          ? renderStrip(
              freshLeg?.date_precision === 'exact' ? freshLeg.departure_date
                : freshLeg?.date_precision === 'month' ? freshLeg.departure_month
                : null,
              freshLeg?.date_precision === 'month' ? 'month' : 'exact',
            )
          : null;
        const stayStrip = renderStrip(genericDateLabel, bookingDateContext?.precision);
        return (
          <>
            {transportDrawerLeg && (
              <TransportDrawer
                leg={transportDrawerLeg}
                options={transportData[transportCacheKey(transportDrawerLeg, transportDrawerTravelerOverride)]?.options}
                feasibility={transportData[transportCacheKey(transportDrawerLeg, transportDrawerTravelerOverride)]?.feasibility}
                loading={transportDrawerLoading}
                error={transportDrawerError}
                summaryStrip={transportStrip}
                defaultTravelerCount={partySize || roughTravelerCount}
                travelerOverride={transportDrawerTravelerOverride}
                onSearchTravelerCount={searchTransportForTravelerCount}
                onClose={() => { setTransportDrawerLeg(null); setTransportDrawerTravelerOverride(null); }}
              />
            )}
            {stayDrawerStay && (
              <StayDrawer
                stay={stayDrawerStay}
                options={stayData[stayDrawerStay.id]?.options}
                loading={stayDrawerLoading}
                error={stayDrawerError}
                // TWM-204: stay_price_estimate lives on the raw Atlas day
                // object, not the Trip Board adapter (it isn't
                // feasibility-derived) — read straight from the stay's
                // first day; Atlas is expected to keep it consistent
                // across every day of the same base.
                stayPriceEstimate={days.find(day => day.day_number === stayDrawerStay.dayNumbers[0])?.stay_price_estimate}
                summaryStrip={stayStrip}
                onClose={() => setStayDrawerStay(null)}
              />
            )}
          </>
        );
      })()}

      {tab === 'Support' && <section>
        <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with this specific itinerary.</p></div></div>
        <SupportContent intro="Swapping something, adjusting dates, or anything unclear about the plan you've already received — the answers below cover the most common cases." />
      </section>}
    </main>
  );
}
