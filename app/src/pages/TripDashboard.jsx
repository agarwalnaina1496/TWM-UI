import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import TripHero from '../components/TripHero.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import SupportContent from '../components/SupportContent.jsx';
import { getItinerary, getTripFeasibility } from '../lib/tripApi.js';
import { bookingReadinessLabel, dayCostRange, verificationTone } from '../lib/atlasView.js';
import {
  transportOptionsFor, feasibleTransportOptions,
  stayOptionsFor, modeLabel, recommendedMode,
  PARTNER_LABEL, MODES,
} from '../lib/bookingCatalog.js';
import { destinationFactRow, contextFactRows, dashboardPrimaryCta } from '../lib/dashboardTracks.js';
import { isTripEmpty } from '../lib/tripLifecycle.js';
import { searchPrefFor } from '../constants/bookingSetup.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../lib/useTripFromUrl.js';
import '../styles/dashboard.css';

// TWM-175/198/206: down from 7 tabs — Map folded into Overview, Docs/Bookings
// retired. Transport/Stay resolution lives inline on the Itinerary item now.
const TABS = [
  { name: 'Overview', icon: '📊' },
  { name: 'Itinerary', icon: '📅' },
  { name: 'Support', icon: '💬' },
];

const BOOKING_PROMPT_SHOWN_KEY = uiStateKey(UI_STATE_SCREEN.DASHBOARD_OVERVIEW, 'bookingPromptShown');

const ARRIVAL_STEPS = ['Reviewing your approved plan', 'Building your day-by-day itinerary', 'Checking practical details'];
const ARRIVAL_STEP_DURATION_MS = 20000;

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const moneyRange = (low, high) => (low == null || high == null ? null : `${money(low)}–${money(high)}`);

// TWM-217/TWM-220: a stay-drawer subject from an enriched `stay_segments[]`
// entry — the Backend resolved this segment's check-in/check-out and their
// source, so the drawer never does date math.
function stayFromSegment(segment) {
  if (!segment) return null;
  return {
    id: segment.id,
    location: segment.location,
    nights: segment.nights,
    departureDate: segment.checkin_date ?? null,
    checkoutDate: segment.checkout_date ?? null,
    datePrecision: segment.date_precision ?? null,
    departureMonth: segment.month ?? null,
    dateSource: segment.date_source ?? null,
    startDayNumber: segment.start_day_number,
    boardItemIds: segment.board_item_ids || [],
  };
}

// A transport-drawer `leg` from an enriched gateway TRAVEL item — the item
// already carries its resolved date + precision.
function legFromItem(item) {
  return {
    from: item.from_city,
    to: item.to_city,
    departureDate: item.date_precision === 'exact' ? item.resolved_date : null,
    departureMonth: item.date_precision === 'month' ? item.resolved_date : null,
  };
}

function BudgetBar({ low, high, min, max }) {
  const span = Math.max(max - min, 1);
  const left = ((low - min) / span) * 100;
  const width = Math.max(((high - low) / span) * 100, 3);
  return <div className="budget-track"><div className="budget-fill" style={{ left: `${left}%`, width: `${width}%` }} /></div>;
}

const READINESS_TONE = { suggested: 'positive', needs_advance_booking: 'caution' };

function BookingReadinessBadge({ status }) {
  if (!status) return null;
  return <StatusPill tone={READINESS_TONE[status] || 'neutral'}>{bookingReadinessLabel(status)}</StatusPill>;
}

function VerificationTag({ status }) {
  if (!status) return null;
  const label = status === 'VERIFIED' ? 'Verified' : 'General guidance';
  return <StatusPill tone={verificationTone(status)} variant="outline">{label}</StatusPill>;
}

// TWM-220: a small inline "worth checking closer to travel" chip — used on a
// day note carrying `needs_verification` and on a `before_you_go` item with
// `verify: true`. Never a standalone list.
function VerifyChip() {
  return <StatusPill tone="caution" variant="outline">verify</StatusPill>;
}

function DashboardBackLink() {
  return <Link className="back-to-trip" to="/">← Back to your trips</Link>;
}

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

  return <button type="button" className={className} disabled={pending} onClick={go}>{cta.label} →</button>;
}

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

// TWM-175/182/220: the Dashboard before a plan is frozen — a per-state
// Overview recap and one actionable next step, rendered entirely from
// `TripView` (lifecycle / context_recap / plan).
function ThinStateDashboard({ view, tripId }) {
  const [tab, setTab] = useState('Overview');
  const factRows = [...contextFactRows(view), destinationFactRow(view)];
  const primaryCta = dashboardPrimaryCta(view);
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

function monthDateBounds(monthValue) {
  if (!monthValue) return {};
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { min: `${monthValue}-01`, max: `${monthValue}-${String(lastDay).padStart(2, '0')}` };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// TWM-216: one exact-date-XOR-month form for a per-entity search-date
// preference. `existing` is the value currently on file for this entity —
// { precision, date } | { precision, month } | null.
function ScheduleDateForm({
  existing, dateLabel = 'Date', helper,
  mode, setMode, value, setValue, onSubmit, onCancel, onClear,
  clearLabel = 'Reset to the default date', pending, error,
}) {
  const [changingPrecision, setChangingPrecision] = useState(false);
  const hasStructuredMonth = existing?.precision === 'month';
  const knownMonthLabel = hasStructuredMonth ? existing.month : null;
  const hasExistingPrecision = Boolean(existing?.precision);
  const showModeChoice = !hasExistingPrecision || changingPrecision;
  const narrowingFromMonth = hasStructuredMonth && !changingPrecision && mode === 'exact';

  function switchPrecision(nextMode) {
    setChangingPrecision(true);
    setMode(nextMode);
    setValue('');
  }

  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <p className="already-booked-note">
        {helper || 'Adding dates improves booking search precision only — it does not change your itinerary plan.'}
      </p>
      {showModeChoice ? (
        <div className="confirmation-form-actions" role="radiogroup" aria-label="Date precision">
          <label>
            <input type="radio" name="schedule-date-mode" checked={mode === 'exact'} disabled={pending}
              onChange={() => switchPrecision('exact')} /> I know the exact date
          </label>
          <label>
            <input type="radio" name="schedule-date-mode" checked={mode === 'month'} disabled={pending}
              onChange={() => switchPrecision('month')} /> I only know the month
          </label>
        </div>
      ) : (
        <p className="already-booked-note">
          {narrowingFromMonth ? `Narrowing down ${knownMonthLabel}. ` : ''}
          <button type="button" className="btn btn-ghost" disabled={pending}
            onClick={() => switchPrecision(mode === 'exact' ? 'month' : 'exact')}>
            {narrowingFromMonth ? 'Not in this month? Change month' : 'Change precision'}
          </button>
        </p>
      )}
      {mode === 'exact' ? (
        <label>{dateLabel}
          {(() => {
            const bounds = narrowingFromMonth && hasStructuredMonth ? monthDateBounds(existing.month) : {};
            const min = bounds.min && bounds.min > todayIsoDate() ? bounds.min : todayIsoDate();
            return (
              <input required type="date" value={value} disabled={pending}
                min={min} max={bounds.max}
                onChange={event => setValue(event.target.value)} />
            );
          })()}
        </label>
      ) : (
        <label>Month
          <input required type="month" value={value} disabled={pending} min={todayIsoDate().slice(0, 7)} onChange={event => setValue(event.target.value)} />
        </label>
      )}
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        {onClear && existing && (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClear}>{clearLabel}</button>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending || !value}>Save</button>
      </div>
    </form>
  );
}

// TWM-213/TWM-216: the trip-wide structured party, edited from inside a
// booking drawer. TWM-220: also the home of the `set_party` open gap prompt.
function TravelerEditForm({ adults, setAdults, children, setChildren, infants, setInfants, onSubmit, onCancel, pending, error, gapPrompt }) {
  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <p className="already-booked-note">
        {gapPrompt || 'Exact traveler counts improve flight fare accuracy and stay/activity search — this does not change your itinerary plan.'}
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

function legKey(leg) {
  return `${leg.from}→${leg.to}`;
}

const MODE_ICON = { flight: '✈️', train: '🚆', bus: '🚌', drive: '🚗' };

function ModeTag({ mode }) {
  return <StatusPill tone="neutral" variant="outline">{MODE_ICON[mode] || '🧭'} {modeLabel(mode)}</StatusPill>;
}

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
  return null;
}

function durationDistanceLabel(option) {
  const parts = [];
  if (option.durationMinutes != null) parts.push(`${Math.round((option.durationMinutes / 60) * 10) / 10}h`);
  if (option.distanceKm != null) parts.push(`${Math.round(option.distanceKm)} km`);
  return parts.join(' · ');
}

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

function resolvedRouteLabel(liveOffer) {
  const origin = liveOffer?.originResolved;
  const destination = liveOffer?.destinationResolved;
  if (!origin && !destination) return null;
  return `Flights from ${origin ? origin.iata : '?'} to ${destination ? destination.iata : '?'}`;
}

const DATE_PRECISION_LABEL = {
  exact: 'Exact date',
  month: 'Flexible dates — prices for the month',
  flexible: 'Flexible dates — no specific day searched',
};

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
    const offers = liveOffer.offers || [liveOffer];
    return (
      <div className="live-offer-block">
        {routeContext}
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
      {option.capability && <span className="stay-option-tag">{option.capability.replace(/_/g, ' ')}</span>}
      {option.capabilityNote && <p>{option.capabilityNote}</p>}
      <TrustedActionCta option={option} label={`${option.ctaLabel || 'Search stays'} ↗`} best={best} />
    </article>
  );
}

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

// TWM-216: a drawer's own per-entity search date. Writes a per-entity
// search pref (set_search_pref); no trip-level date control exists. Not
// editable when the date came from the itinerary's trip dates.
function DrawerDateRow({ label, source, precision, valueLabel, checkoutLabel, editable, onEdit, editOpen, editForm }) {
  const known = precision === 'exact' || precision === 'month';
  return (
    <div className="booking-summary-strip">
      <p className="transport-drawer-date">
        📅 {label}: {known ? valueLabel : 'flexible'}
        {source === 'trip_dates' && ' · from your itinerary'}
        {source === 'search_pref' && ' · your search date'}
      </p>
      {checkoutLabel && <p className="transport-drawer-date">Check-out {checkoutLabel}</p>}
      {editable && (
        <div className="booking-summary-row">
          <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>
            {source === 'search_pref' ? 'Change this search date' : 'Add a date for this search'}
          </button>
        </div>
      )}
      {editOpen && editForm}
    </div>
  );
}

function DrawerPartyRow({ label, onEdit, editOpen, editForm }) {
  return (
    <div className="booking-summary-strip">
      <div className="booking-summary-row">
        <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>
          👤 {label ? `Booking for ${label} · Change` : 'Set travellers'}
        </button>
      </div>
      {editOpen && editForm}
    </div>
  );
}

function TransportDrawer({ leg, options, feasibility, loading, error, dateRow, partyRow, onClose }) {
  if (!leg) return null;
  const resolvedOptions = feasibleTransportOptions(options || [], feasibility);
  const feasibleModeNames = new Set((feasibility?.modes || []).map(entry => entry.mode));
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
        {dateRow}
        {partyRow}
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

function StayDrawer({ stay, options, loading, error, stayPriceEstimate, dateRow, partyRow, onClose }) {
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
        {dateRow}
        {partyRow}
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

// TWM-215: the single generic "keep the open drawer's cache filled" hook —
// regardless of how it got open (a fresh click, or a save elsewhere
// invalidating the cache while the drawer stayed open).
function useDrawerFetch(openKey, cache, loading, fetcher) {
  useEffect(() => {
    if (!openKey || cache[openKey] || loading) return;
    fetcher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, cache, loading]);
}

export default function TripDashboard() {
  const { commandSnapshot, sendTripCommand, tripLoadStatus, uiState, updateUiState, openTrip } = useTrip();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlTripId = useTripFromUrl(openTrip);
  const initialTab = TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Overview';
  const [tab, setTab] = useState(initialTab);
  const [activeDay, setActiveDay] = useState(null);

  const view = commandSnapshot;
  const tripId = view?.id;
  const frozenPlan = view?.plan?.frozen;
  const itineraryReady = view?.summary != null;

  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const [showBookingPrompt, setShowBookingPrompt] = useState(false);
  const bootStarted = useRef(false);

  // The enriched Atlas document — fetched lazily once an itinerary exists
  // (TWM-217). GET /trips/{id}/itinerary; each timeline item carries its
  // own id / is_gateway_leg / resolved date; `result.stay_segments[]` at
  // the top level.
  const [itineraryStatus, setItineraryStatus] = useState('idle'); // idle | loading | ready | error
  const [itineraryDoc, setItineraryDoc] = useState(null);
  const [itineraryFetchError, setItineraryFetchError] = useState(null);
  const [itineraryTripId, setItineraryTripId] = useState(null);
  const itineraryFetchKey = useRef(null);

  // Per-entity search-date preference, edited from inside the open drawer.
  const [prefEditOpen, setPrefEditOpen] = useState(false);
  const [prefEditMode, setPrefEditMode] = useState('exact');
  const [prefEditValue, setPrefEditValue] = useState('');
  const [prefEditTarget, setPrefEditTarget] = useState(null); // { type, id }
  const [prefEditPending, setPrefEditPending] = useState(false);
  const [prefEditError, setPrefEditError] = useState(null);

  // Trip-wide structured party (set_party), edited from inside the open drawer.
  const [travelerEditOpen, setTravelerEditOpen] = useState(false);
  const [travelerEditAdults, setTravelerEditAdults] = useState(1);
  const [travelerEditChildren, setTravelerEditChildren] = useState(0);
  const [travelerEditInfants, setTravelerEditInfants] = useState(0);
  const [travelerEditPending, setTravelerEditPending] = useState(false);
  const [travelerEditError, setTravelerEditError] = useState(null);

  const [transportDrawerItem, setTransportDrawerItem] = useState(null); // an enriched gateway TRAVEL item
  const [transportDrawerLoading, setTransportDrawerLoading] = useState(false);
  const [transportDrawerError, setTransportDrawerError] = useState(null);

  const [stayDrawerSegmentId, setStayDrawerSegmentId] = useState(null);
  const [stayDrawerLoading, setStayDrawerLoading] = useState(false);
  const [stayDrawerError, setStayDrawerError] = useState(null);

  const [transportData, setTransportData] = useState({});
  const [stayData, setStayData] = useState({});

  // TWM-188: a direct/deep-link/stale-tab navigation to an empty trip has
  // nothing real to render — redirect home.
  useEffect(() => {
    if (!urlTripId || tripLoadStatus !== 'ready' || !isTripEmpty(view)) return;
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTripId, tripLoadStatus, view, navigate]);

  const trackedThinState = useRef(false);
  useEffect(() => {
    if (trackedThinState.current || tripLoadStatus !== 'ready' || frozenPlan) return;
    trackedThinState.current = true;
    trackEvent('dashboard_thin_state_viewed', { stage: view?.lifecycle?.stage ?? 'new' });
  }, [tripLoadStatus, frozenPlan, view?.lifecycle?.stage]);

  // Reopen never re-invokes Atlas: once an itinerary exists, render the
  // saved result. Otherwise, with a frozen plan, drive the (idempotent)
  // start_itinerary command once. TripContext re-fetches the TripView, so
  // `itineraryReady` flips true when it lands.
  useEffect(() => {
    if (tripLoadStatus !== 'ready' || !frozenPlan) return;
    if (itineraryReady) {
      setBootStatus('ready');
      return;
    }
    if (bootStarted.current) return;
    bootStarted.current = true;
    setBootStatus('booting');
    sendTripCommand('start_itinerary')
      .then(response => {
        if (response.trip?.summary != null) {
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
  }, [tripLoadStatus, frozenPlan, itineraryReady, sendTripCommand]);

  // Fetch the itinerary document once an itinerary exists — and re-fetch
  // whenever the trip version moves (a set_search_pref / set_party save
  // re-resolves per-item dates).
  useEffect(() => {
    if (!itineraryReady || !tripId) return;
    const key = `${tripId}:${view.version}`;
    if (itineraryFetchKey.current === key) return;
    itineraryFetchKey.current = key;
    setItineraryStatus('loading');
    getItinerary(tripId)
      .then(doc => {
        setItineraryDoc(doc);
        setItineraryTripId(tripId);
        setItineraryStatus('ready');
      })
      .catch(error => {
        setItineraryStatus('error');
        setItineraryFetchError(error.message || 'Could not load the detailed itinerary.');
      });
  }, [itineraryReady, tripId, view?.version]);

  const trackedDashboardEntry = useRef(false);
  useEffect(() => {
    if (trackedDashboardEntry.current || itineraryStatus !== 'ready') return;
    trackedDashboardEntry.current = true;
    trackEvent('itinerary_viewed', { view_source: 'dashboard' });
    trackEvent('dashboard_entered', { entry_source: 'itinerary' });
  }, [itineraryStatus]);

  const party = view?.booking?.party ?? null;
  const partyTotal = party ? party.adults + party.children + party.infants : null;
  const partyLabel = party ? travelerPartyLabel(party) : null;
  const openGapPrompt = view?.open_gaps?.find(gap => gap.resolution === 'set_party')?.detail ?? null;

  const doc = itineraryStatus === 'ready' && itineraryTripId === tripId ? itineraryDoc?.result : null;
  const finalItinerary = doc?.final_itinerary ?? null;
  const days = finalItinerary?.days ?? [];
  const staySegments = doc?.stay_segments ?? [];
  const staySegmentByItemId = {};
  for (const segment of staySegments) {
    for (const itemId of segment.board_item_ids || []) staySegmentByItemId[itemId] = segment;
  }

  const transportItem = transportDrawerItem
    ? (days.flatMap(d => d.timeline || []).find(i => i.id === transportDrawerItem.id) ?? transportDrawerItem)
    : null;
  const staySegment = stayDrawerSegmentId ? staySegments.find(s => s.id === stayDrawerSegmentId) ?? null : null;
  const stay = stayFromSegment(staySegment);

  function transportCacheKey(item) {
    return `${legKey(legFromItem(item))}::${item.resolved_date ?? 'flex'}::${partyTotal ?? 'p?'}`;
  }
  function stayCacheKey(segment) {
    if (!segment) return null;
    return `${segment.id}::${segment.checkin_date ?? 'flex'}::${segment.nights}::${partyTotal ?? 'p?'}`;
  }

  useDrawerFetch(
    transportItem ? transportCacheKey(transportItem) : null,
    transportData,
    transportDrawerLoading,
    () => fetchTransportOptions(transportItem),
  );
  useDrawerFetch(
    stayCacheKey(staySegment),
    stayData,
    stayDrawerLoading,
    () => fetchStayOptions(staySegment),
  );

  async function fetchTransportOptions(item) {
    if (!item) return;
    const key = transportCacheKey(item);
    if (transportData[key]) return;
    setTransportDrawerError(null);
    setTransportDrawerLoading(true);
    try {
      const leg = legFromItem(item);
      const feasibility = await getTripFeasibility(tripId, { origin: leg.from, destination: leg.to });
      const approvedModes = (feasibility?.modes || []).map(entry => entry.mode);
      const options = await transportOptionsFor(tripId, leg, party, approvedModes);
      setTransportData(prev => ({ ...prev, [key]: { options, feasibility } }));
    } catch (error) {
      setTransportDrawerError(error.message || 'Could not load transport options.');
    } finally {
      setTransportDrawerLoading(false);
    }
  }

  async function fetchStayOptions(segment) {
    if (!segment) return;
    const key = stayCacheKey(segment);
    if (!key || stayData[key]) return;
    setStayDrawerLoading(true);
    try {
      const options = await stayOptionsFor(tripId, stayFromSegment(segment), party);
      setStayData(prev => ({ ...prev, [key]: { options } }));
    } catch (error) {
      setStayDrawerError(error.message || 'Could not load stay options.');
    } finally {
      setStayDrawerLoading(false);
    }
  }

  function openTransportDrawer(item) {
    setTransportDrawerItem(item);
    setTransportDrawerError(null);
    setTransportDrawerLoading(false);
  }
  function openStayDrawer(segmentId) {
    setStayDrawerSegmentId(segmentId);
    setStayDrawerError(null);
    setStayDrawerLoading(false);
  }

  function openPrefEditForm(targetType, entity, suggestedMode) {
    const existing = searchPrefFor(entity);
    const mode = suggestedMode === 'month' ? 'month' : (existing?.precision || 'exact');
    setPrefEditTarget({ type: targetType, id: entity.id });
    setPrefEditMode(mode);
    setPrefEditValue(existing?.precision === mode ? (mode === 'exact' ? existing.date : existing.month) || '' : '');
    setPrefEditError(null);
    setPrefEditOpen(true);
  }

  async function submitPrefEdit(event) {
    event.preventDefault();
    if (!prefEditTarget) return;
    setPrefEditPending(true);
    setPrefEditError(null);
    try {
      await sendTripCommand('set_search_pref', {
        searchPrefUpdate: {
          target_type: prefEditTarget.type,
          target_id: prefEditTarget.id,
          ...(prefEditMode === 'exact' ? { date: prefEditValue } : { month: prefEditValue }),
        },
      });
      trackEvent('search_pref_updated', { target_type: prefEditTarget.type, precision: prefEditMode });
      setTransportData({});
      setStayData({});
      setPrefEditOpen(false);
    } catch (error) {
      setPrefEditError(error.message || 'Could not save that date — your existing options are still available.');
    } finally {
      setPrefEditPending(false);
    }
  }

  async function clearPrefEdit() {
    if (!prefEditTarget) return;
    setPrefEditPending(true);
    setPrefEditError(null);
    try {
      await sendTripCommand('clear_search_pref', {
        searchPrefClear: { target_type: prefEditTarget.type, target_id: prefEditTarget.id },
      });
      trackEvent('search_pref_cleared', { target_type: prefEditTarget.type });
      setTransportData({});
      setStayData({});
      setPrefEditOpen(false);
    } catch (error) {
      setPrefEditError(error.message || 'Could not reset that date — your existing options are still available.');
    } finally {
      setPrefEditPending(false);
    }
  }

  function openTravelerEditForm() {
    setTravelerEditAdults(party?.adults ?? 1);
    setTravelerEditChildren(party?.children ?? 0);
    setTravelerEditInfants(party?.infants ?? 0);
    setTravelerEditError(null);
    setTravelerEditOpen(true);
  }

  async function submitTravelerEdit(event) {
    event.preventDefault();
    setTravelerEditPending(true);
    setTravelerEditError(null);
    try {
      await sendTripCommand('set_party', {
        partyUpdate: {
          adults: travelerEditAdults,
          children: travelerEditChildren,
          infants: travelerEditInfants,
        },
      });
      trackEvent('party_updated', {
        adults: travelerEditAdults,
        children: travelerEditChildren,
        infants: travelerEditInfants,
      });
      setTransportData({});
      setStayData({});
      setTravelerEditOpen(false);
    } catch (error) {
      setTravelerEditError(error.message || 'Could not save the party — your existing options are still available.');
    } finally {
      setTravelerEditPending(false);
    }
  }

  function resolveBookingPrompt(destination) {
    trackEvent('booking_prompt_choice', { choice: destination });
    setShowBookingPrompt(false);
    if (destination === 'bookings') setTab('Itinerary');
  }

  if (tripLoadStatus === 'ready' && !view) {
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

  if (tripLoadStatus === 'ready' && !frozenPlan) {
    return <ThinStateDashboard view={view} tripId={tripId} />;
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

  if (bootStatus === 'booting' && !itineraryReady) {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <HonestTransition steps={ARRIVAL_STEPS} label="Building your itinerary" stepDurationMs={ARRIVAL_STEP_DURATION_MS} />
      </main>
    );
  }

  if (!itineraryReady || !view.summary) {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading your trip…</div>
      </main>
    );
  }

  const summary = view.summary;
  const budget = view.budget_breakdown;
  const selectedDay = days.find(day => day.day_number === activeDay) || days[0];
  const selectedDayCost = selectedDay ? dayCostRange(selectedDay) : { low: 0, high: 0 };
  const allCosts = days.flatMap(day => { const range = dayCostRange(day); return [range.low, range.high]; });
  const costMin = Math.min(...allCosts, 0);
  const costMax = Math.max(...allCosts, 1);

  // TWM-216/TWM-220: the shared party editor lives inside whichever drawer
  // is open. The `set_party` open gap surfaces here as its prompt.
  const partyEditForm = (
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
      gapPrompt={!party ? openGapPrompt : null}
    />
  );
  const drawerPartyRow = (
    <DrawerPartyRow
      label={partyLabel}
      onEdit={openTravelerEditForm}
      editOpen={travelerEditOpen}
      editForm={partyEditForm}
    />
  );

  const prefEntity = prefEditTarget
    ? normalizePrefEntity(prefEditTarget.type === 'stay' ? staySegment : transportItem, prefEditTarget.type)
    : null;
  const prefEditForm = (
    <ScheduleDateForm
      existing={searchPrefFor(prefEntity)}
      dateLabel={prefEditTarget?.type === 'stay' ? 'Check-in date' : 'Leg date'}
      helper="Prefill this one search with a specific date. It does not change your itinerary or any other search."
      mode={prefEditMode}
      setMode={setPrefEditMode}
      value={prefEditValue}
      setValue={setPrefEditValue}
      onSubmit={submitPrefEdit}
      onCancel={() => setPrefEditOpen(false)}
      onClear={clearPrefEdit}
      pending={prefEditPending}
      error={prefEditError}
    />
  );

  const transportDateRow = transportItem ? (() => {
    const entity = normalizePrefEntity(transportItem, 'transport');
    return (
      <DrawerDateRow
        label="This leg"
        source={transportItem.date_source}
        precision={transportItem.date_precision}
        valueLabel={transportItem.resolved_date}
        editable={transportItem.date_source !== 'trip_dates'}
        onEdit={() => openPrefEditForm('transport', entity, 'exact')}
        editOpen={prefEditOpen && prefEditTarget?.type === 'transport'}
        editForm={prefEditForm}
      />
    );
  })() : null;

  const stayDateRow = staySegment ? (() => {
    const entity = normalizePrefEntity(staySegment, 'stay');
    return (
      <DrawerDateRow
        label="Check-in"
        source={staySegment.date_source}
        precision={staySegment.date_precision}
        valueLabel={staySegment.date_precision === 'month' ? staySegment.month : staySegment.checkin_date}
        checkoutLabel={staySegment.checkout_date}
        editable={staySegment.date_source !== 'trip_dates'}
        onEdit={() => openPrefEditForm('stay', entity, 'exact')}
        editOpen={prefEditOpen && prefEditTarget?.type === 'stay'}
        editForm={prefEditForm}
      />
    );
  })() : null;

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
        summary={summary}
        actions={<>
          <button className="btn btn-ghost" type="button" onClick={() => alert('PDF generation is not available yet.')}>📄 PDF</button>
        </>}
      />

      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">{TABS.map(({ name, icon }) => <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}><span className="tab-icon">{icon}</span> {name}</button>)}</nav>

      {tab === 'Overview' && <section aria-label="Trip overview">
        {summary.route_rationale && (
          <div className="route-rationale"><span className="hero-why-label">Why this route</span><p>{summary.route_rationale}</p></div>
        )}

        {budget && (
          <>
            <div className="tab-intro"><div><h2>💰 Estimated budget</h2><p>{budget.fit_note}</p></div></div>
            <BudgetBar low={summary.budget.low} high={summary.budget.high} min={0} max={Math.max(summary.budget.high, 1)} />
            <div className="budget-summary-card">
              {budget.lines.map((line, index) => <div className="budget-summary-row" key={index}><span>{line.category}</span><strong>{moneyRange(line.low, line.high)}</strong><p>{line.note}</p></div>)}
              <div className="budget-summary-row total"><span>Estimated total</span><strong>{moneyRange(summary.budget.low, summary.budget.high)}</strong></div>
            </div>
          </>
        )}

        {view.before_you_go?.length > 0 && (
          <div className="before-you-go">
            <div className="tab-intro"><div><h2>🎒 Before you go</h2></div></div>
            <ul className="trip-notes-list">
              {view.before_you_go.map((item, index) => (
                <li key={index}>
                  <strong>{item.title}</strong> — {item.detail} {item.verify && <VerifyChip />}
                </li>
              ))}
            </ul>
          </div>
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
            <div className="atlas-timeline">
              {selectedDay.timeline.map(item => {
                const isGatewayLeg = item.kind === 'TRAVEL' && item.is_gateway_leg;
                const staySeg = item.kind === 'STAY' ? staySegmentByItemId[item.id] : null;
                const hasItemActions = isGatewayLeg || staySeg;
                return (
                  <div className="atlas-item" key={item.id}>
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
                      {hasItemActions && (
                        <div className="itinerary-set-dates">
                          {staySeg && (
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => openStayDrawer(staySeg.id)}>
                              🏨 Stay options ▾
                            </button>
                          )}
                          {isGatewayLeg && (
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => openTransportDrawer(item)}>
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
            {selectedDay.backup_plan && (
              <div className="atlas-day-backup">
                <span className="footer-label">🔁 If plans change</span>
                <p>{selectedDay.backup_plan}</p>
              </div>
            )}
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
                      <span><strong>{note.title}</strong> — {note.detail} {note.needs_verification && <VerifyChip />}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        </div>
      </section>}

      {transportDrawerItem && (
        <TransportDrawer
          leg={transportItem ? legFromItem(transportItem) : legFromItem(transportDrawerItem)}
          options={transportItem ? transportData[transportCacheKey(transportItem)]?.options : undefined}
          feasibility={transportItem ? transportData[transportCacheKey(transportItem)]?.feasibility : undefined}
          loading={transportDrawerLoading}
          error={transportDrawerError}
          dateRow={transportDateRow}
          partyRow={drawerPartyRow}
          onClose={() => setTransportDrawerItem(null)}
        />
      )}
      {stayDrawerSegmentId && stay && (
        <StayDrawer
          stay={stay}
          options={stayData[stayCacheKey(staySegment)]?.options}
          loading={stayDrawerLoading}
          error={stayDrawerError}
          stayPriceEstimate={days.find(day => day.day_number === stay.startDayNumber)?.stay_price_estimate}
          dateRow={stayDateRow}
          partyRow={drawerPartyRow}
          onClose={() => setStayDrawerSegmentId(null)}
        />
      )}

      {tab === 'Support' && <section>
        <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with this specific itinerary.</p></div></div>
        <SupportContent intro="Swapping something, adjusting dates, or anything unclear about the plan you've already received — the answers below cover the most common cases." />
      </section>}
    </main>
  );
}

function travelerPartyLabel(party) {
  const parts = [];
  for (const [count, singular, plural] of [
    [party.adults, 'adult', 'adults'],
    [party.children, 'child', 'children'],
    [party.infants, 'infant', 'infants'],
  ]) {
    if (count) parts.push(`${count} ${count === 1 ? singular : plural}`);
  }
  return parts.join(', ') || '1 adult';
}

// Normalize an enriched entity (timeline item or stay segment) to the flat
// { id, date_source, precision, date, month } shape `searchPrefFor` reads.
function normalizePrefEntity(entity, type) {
  if (!entity) return null;
  if (type === 'stay') {
    return {
      id: entity.id,
      date_source: entity.date_source,
      precision: entity.date_precision,
      date: entity.checkin_date,
      month: entity.month,
    };
  }
  return {
    id: entity.id,
    date_source: entity.date_source,
    precision: entity.date_precision,
    date: entity.date_precision === 'exact' ? entity.resolved_date : null,
    month: entity.date_precision === 'month' ? entity.resolved_date : null,
  };
}
