import { feasibleTransportOptions, recommendedMode } from '../../lib/booking/transportOptions.js';
import { modeLabel, PARTNER_LABEL, MODES } from '../../lib/booking/shared.js';
import { ModeTag, VerificationTag } from '../StatusPills.jsx';
import StatusPill from '../ui/StatusPill.jsx';
import TrustedActionCta from './TrustedActionCta.jsx';

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

export default function TransportDrawer({ leg, options, feasibility, loading, error, dateRow, partyRow, onClose }) {
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
