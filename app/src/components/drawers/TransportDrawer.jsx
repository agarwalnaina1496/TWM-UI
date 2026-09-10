import BookingDrawer from './BookingDrawer.jsx';
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

function hubLastMileLabel(hub) {
  const parts = [];
  if (hub.lastMileKm != null) parts.push(`${Math.round(hub.lastMileKm)} km`);
  if (hub.lastMileDurationMinutes != null) parts.push(`${Math.round((hub.lastMileDurationMinutes / 60) * 10) / 10}h`);
  return parts.join(' · ');
}

function hublessTownName(leg, hub) {
  return hub?.side === 'origin' ? leg.from : leg.to;
}

function lastMileLinks(hub, townName) {
  const from = encodeURIComponent(hub?.city || '');
  const to = encodeURIComponent(townName || '');
  return [
    { label: 'Cab', href: `https://www.google.com/search?q=${from}+to+${to}+cab` },
    { label: 'Bus', href: `https://www.redbus.in/search?fromCityName=${from}&toCityName=${to}` },
    { label: 'Train to railhead', href: `https://www.irctc.co.in/nget/train-search` },
  ];
}

// TWM-215: passive context only — the hub → town last mile is arranged
// locally, never its own bookable search.
function HubLastMileNote({ townName, hub, direction }) {
  const label = hubLastMileLabel(hub);
  if (!label) return null;
  const copy = direction === 'origin'
    ? `Getting to ${hub.city}: ~${label} from ${townName}.`
    : `Then ~${label} onward to ${townName}.`;
  return (
    <div className="hub-last-mile-note">
      <p>{copy} TWM doesn't book this leg.</p>
      <div className="last-mile-links">
        {lastMileLinks(hub, townName).map(link => (
          <a key={link.label} className="stay-option-tag" href={link.href} target="_blank" rel="noreferrer">{link.label} ↗</a>
        ))}
      </div>
    </div>
  );
}

// The candidate-gateway picker: one native radio per hub with its last-mile
// estimate and Backend-resolved feasible modes. Unranked — the first option is
// only the default selection, not a recommendation.
function HubPicker({ townName, hubs, selectedCity, onSelect }) {
  return (
    <fieldset className="hub-picker">
      <legend className="hub-picker-intro">
        {townName} has no direct long-haul transport. Pick a nearby gateway city:
      </legend>
      {hubs.map(hub => {
        const lastMile = hubLastMileLabel(hub);
        const feasibleModes = hub.feasibleModes || [];
        return (
          <label key={hub.city} className={`hub-row${hub.city === selectedCity ? ' selected' : ''}`}>
            <input
              type="radio"
              name="gateway-hub"
              value={hub.city}
              checked={hub.city === selectedCity}
              onChange={() => onSelect(hub.city)}
            />
            <strong>{hub.city}</strong>
            {lastMile && <span className="stay-option-tag">{lastMile} last mile</span>}
            <span className="hub-row-modes">
              {feasibleModes.length
                ? feasibleModes.map(mode => <ModeTag key={mode} mode={mode} />)
                : <span className="stay-option-tag">No modes resolved</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
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

// The quiet band under the search card — the gateway note + hub picker when
// an endpoint has no direct long-haul route, styled like the stay drawer's
// estimate band. Null (no band) for a directly-connected leg.
function TransportContextBand({ leg, hubList, selectedHub, autoOriginHub, onSelectHub }) {
  if (!hubList.length && !autoOriginHub) return null;
  return (
    <div className="drawer-context-band">
      {autoOriginHub && (
        <>
          <p className="hub-picker-intro">{leg.from} has no direct long-haul route — departing via {autoOriginHub.city}.</p>
          <HubLastMileNote townName={leg.from} hub={autoOriginHub} direction="origin" />
        </>
      )}
      {hubList.length > 1 && (
        <HubPicker townName={hublessTownName(leg, hubList[0])} hubs={hubList} selectedCity={selectedHub?.city} onSelect={onSelectHub} />
      )}
      {hubList.length === 1 && (
        <p className="hub-picker-intro">{hublessTownName(leg, hubList[0])} has no direct long-haul route — routed via {hubList[0].city}.</p>
      )}
      {selectedHub && (
        <HubLastMileNote
          townName={hublessTownName(leg, selectedHub)}
          hub={selectedHub}
          direction={selectedHub.side === 'origin' ? 'origin' : 'destination'}
        />
      )}
    </div>
  );
}

function modeSummary(option) {
  if (option.direct) return 'Direct';
  const hubs = option.hubs || [];
  if (hubs.length === 1) {
    const lastMile = hubLastMileLabel(hubs[0]);
    return `Via ${hubs[0].city}${lastMile ? ` + ${lastMile}` : ''}`;
  }
  if (hubs.length > 1) return `Via ${hubs.map(hub => hub.city).join(' / ')}`;
  return 'No direct transport identified';
}

function ChooserBody({ leg, modeOptions, ruledOutModes, searchCard, onSelectMode }) {
  return (
    <>
      {searchCard}
      <p className="drawer-section-heading">Choose transport</p>
      <div className="transport-mode-list">
        {modeOptions.map(option => (
          <button
            key={option.mode}
            type="button"
            className="transport-mode-row"
            onClick={() => onSelectMode(option.mode)}
          >
            <ModeTag mode={option.mode} />
            <span>{modeSummary(option)}</span>
          </button>
        ))}
      </div>
      {ruledOutModes.length > 0 && (
        <ul className="transport-ruled-out-list">
          {ruledOutModes.map(mode => <li key={mode}><ModeTag mode={mode} /> Not available for this route.</li>)}
        </ul>
      )}
      <p className="already-booked-note">{leg.from} → {leg.to}</p>
    </>
  );
}

function NotFeasibleModes({ modes }) {
  if (!modes.length) return null;
  return (
    <details className="transport-drawer-not-feasible">
      <summary>Other modes ({modes.length} not available for this route)</summary>
      <ul className="trip-notes-list">
        {modes.map(mode => <li key={mode}><ModeTag mode={mode} /> Not available for this route.</li>)}
      </ul>
    </details>
  );
}

function SelectedTransportBody({
  leg, selectedMode, hasPerModeOptions, currentModeOption, hubList,
  selectedHub, autoOriginHub, onSelectHub, options, feasibility, loading,
  error, searchCard,
}) {
  const resolvedOptions = feasibleTransportOptions(options || [], feasibility);
  const feasibleModeNames = new Set(
    hasPerModeOptions ? [selectedMode] : (feasibility?.modes || []).map(entry => entry.mode),
  );
  const notFeasibleModes = MODES.filter(mode => !feasibleModeNames.has(mode));
  const recommended = resolvedOptions.length ? recommendedMode(resolvedOptions) : undefined;
  const emptyMessage = currentModeOption && !currentModeOption.direct && hubList.length === 0
    ? 'No direct transport identified.'
    : hubList.length === 0
      ? 'No direct transport identified for this leg.'
      : 'No bookable transport options for this gateway city — try another.';
  return (
    <>
      {searchCard}
      <TransportContextBand
        leg={leg} hubList={currentModeOption?.direct ? [] : hubList} selectedHub={selectedHub}
        autoOriginHub={autoOriginHub} onSelectHub={onSelectHub}
      />
      <p className="drawer-section-heading">How to get there</p>
      {loading && <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>}
      {error && <p className="already-booked-note" role="alert">{error}</p>}
      {!loading && !error && (
        resolvedOptions.length === 0 ? (
          <p className="already-booked-note" role="status">{emptyMessage}</p>
        ) : (
          <>
            {recommended && <RecommendedModeCard option={recommended} />}
            <div className="stay-options-grid">
              {resolvedOptions.map(option => (
                <TransportOptionCard key={option.mode} option={option} best={recommended ? option === recommended : false} />
              ))}
            </div>
          </>
        )
      )}
      {!loading && !error && <NotFeasibleModes modes={notFeasibleModes} />}
    </>
  );
}

export default function TransportDrawer({
  leg, modeOptions = [], selectedMode = null, onSelectMode, onBack,
  hubs = [], selectedHub = null, autoOriginHub = null, onSelectHub,
  options, feasibility, loading, error, searchCard, onClose,
}) {
  if (!leg) return null;
  const hubList = hubs || []; // the picker side only (destination when both endpoints are hubless)
  const hasPerModeOptions = modeOptions.length > 0;
  const currentModeOption = hasPerModeOptions
    ? modeOptions.find(option => option.mode === selectedMode)
    : null;
  if (hasPerModeOptions && !selectedMode) {
    const chooserModes = modeOptions.filter(option => option.direct || (option.hubs || []).some(hub => hub.feasible !== false));
    const modeNames = new Set(chooserModes.map(option => option.mode));
    const ruledOutModes = MODES.filter(mode => !modeNames.has(mode));
    return (
      <BookingDrawer
        ariaLabel={`Transport: ${leg.from} to ${leg.to}`}
        closeLabel="Close transport options"
        title={`${leg.from} → ${leg.to}`}
        onClose={onClose}
      >
        <ChooserBody
          leg={leg}
          modeOptions={chooserModes}
          ruledOutModes={ruledOutModes}
          searchCard={searchCard}
          onSelectMode={onSelectMode}
        />
      </BookingDrawer>
    );
  }
  return (
    <BookingDrawer
      ariaLabel={`Transport: ${leg.from} to ${leg.to}`}
      closeLabel="Close transport options"
      title={`${leg.from} → ${leg.to}`}
      meta={selectedMode ? modeLabel(selectedMode) : null}
      onBack={hasPerModeOptions ? onBack : null}
      onClose={onClose}
    >
      <SelectedTransportBody
        leg={leg}
        selectedMode={selectedMode}
        hasPerModeOptions={hasPerModeOptions}
        currentModeOption={currentModeOption}
        hubList={hubList}
        selectedHub={selectedHub}
        autoOriginHub={autoOriginHub}
        onSelectHub={onSelectHub}
        options={options}
        feasibility={feasibility}
        loading={loading}
        error={error}
        searchCard={searchCard}
      />
    </BookingDrawer>
  );
}
