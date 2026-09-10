import BookingDrawer from './BookingDrawer.jsx';
import { feasibleTransportOptions } from '../../lib/booking/transportOptions.js';
import { modeLabel, PARTNER_LABEL, MODES } from '../../lib/booking/shared.js';
import { ModeTag, VerificationTag } from '../StatusPills.jsx';
import StatusPill from '../ui/StatusPill.jsx';
import TrustedActionCta from './TrustedActionCta.jsx';

function durationDistanceLabel(option) {
  const parts = [];
  if (option.durationMinutes != null) parts.push(durationLabel(option.durationMinutes));
  if (option.distanceKm != null) parts.push(distanceLabel(option.distanceKm));
  return parts.join(' · ');
}

function distanceLabel(km) {
  return `~${Math.round(km).toLocaleString('en-US')} km`;
}

function hubHaulLabel(hub) {
  const km = hub?.longHaulDistanceKm ?? hub?.distanceKm;
  return km != null ? distanceLabel(km) : null;
}

function durationLabel(minutes) {
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  return `~${Math.max(1, Math.round(minutes / 60))} h`;
}

function journeyHoursLabel(note) {
  const match = /roughly\s+(\d+)\s*h/i.exec(note || '');
  return match ? `~${match[1]} h journey` : note;
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
  if (hub.lastMileKm != null) parts.push(distanceLabel(hub.lastMileKm));
  if (hub.lastMileDurationMinutes != null) parts.push(durationLabel(hub.lastMileDurationMinutes));
  return parts.join(' · ');
}

function hublessTownName(leg, hub) {
  return hub?.side === 'origin' ? leg.from : leg.to;
}

function lastMileLinks(hub, townName, mode) {
  const from = encodeURIComponent(hub?.city || '');
  const to = encodeURIComponent(townName || '');
  const links = [{ label: 'Cab', href: `https://www.google.com/search?q=${from}+to+${to}+cab` }];
  links.push(mode === 'train'
    ? { label: 'Auto', href: `https://www.google.com/search?q=${from}+to+${to}+auto` }
    : { label: 'Bus', href: `https://www.redbus.in/search?fromCityName=${from}&toCityName=${to}` });
  return links;
}

// TWM-215: passive context only — the hub → town last mile is arranged
// locally, never its own bookable search.
function HubLastMileNote({ townName, hub, direction, mode }) {
  const label = hubLastMileLabel(hub);
  if (!label) return null;
  const copy = direction === 'origin'
    ? `Getting to ${hub.city}: ${label} from ${townName}.`
    : `Then ${label} onward to ${townName}.`;
  return (
    <div className="hub-last-mile-note">
      <p>{copy} TWM doesn't book this leg.</p>
      <div className="last-mile-links">
        {lastMileLinks(hub, townName, mode).map(link => (
          <a key={link.label} className="stay-option-tag" href={link.href} target="_blank" rel="noreferrer">{link.label} ↗</a>
        ))}
      </div>
    </div>
  );
}

function HubPicker({ townName, hubs, selectedCity, onSelect, mode }) {
  const label = mode === 'train' ? 'railhead' : 'gateway city';
  return (
    <fieldset className="hub-picker">
      <legend className="hub-picker-intro">
        {townName} has no direct {modeLabel(mode).toLowerCase()} access. Pick a nearby {label}:
      </legend>
      {hubs.map(hub => {
        const lastMile = hubLastMileLabel(hub);
        const haul = hubHaulLabel(hub);
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
            {haul && <span className="stay-option-tag">{haul} long haul</span>}
            {lastMile && <span className="stay-option-tag">{lastMile} last mile</span>}
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

function TransportOptionCard({ option, onAddDates }) {
  const durationDistance = durationDistanceLabel(option);
  const isFlight = option.mode === 'flight';
  return (
    <article className="stay-option-card">
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
        secondary={isFlight}
      />
    </article>
  );
}

function TransportContextBand({ leg, hubList, selectedHub, autoOriginHub, onSelectHub, mode, phase }) {
  const showLastMile = selectedHub && (phase !== 'before' || selectedHub.side === 'origin');
  if (!hubList.length && !autoOriginHub && !showLastMile) return null;
  const heading = mode === 'train' ? 'Railhead' : 'Gateway';
  const showGatewayControls = hubList.length > 0 || autoOriginHub;
  return (
    <div className="drawer-context-band">
      {showGatewayControls && <p className="drawer-section-heading">{heading}</p>}
      {autoOriginHub && (
        <>
          <p className="hub-picker-intro">{leg.from} has no direct {modeLabel(mode).toLowerCase()} access — start via {autoOriginHub.city}.</p>
          <HubLastMileNote townName={leg.from} hub={autoOriginHub} direction="origin" mode={mode} />
        </>
      )}
      {hubList.length > 1 && (
        <HubPicker townName={hublessTownName(leg, hubList[0])} hubs={hubList} selectedCity={selectedHub?.city} onSelect={onSelectHub} mode={mode} />
      )}
      {hubList.length === 1 && (
        <p className="hub-picker-intro">
          {hublessTownName(leg, hubList[0])} has no direct {modeLabel(mode).toLowerCase()} access — routed via {hubList[0].city}
          {hubHaulLabel(hubList[0]) ? `, ${hubHaulLabel(hubList[0])} long haul` : ''}.
        </p>
      )}
      {showLastMile && (
        <HubLastMileNote
          townName={hublessTownName(leg, selectedHub)}
          hub={selectedHub}
          direction={selectedHub.side === 'origin' ? 'origin' : 'destination'}
          mode={mode}
        />
      )}
    </div>
  );
}

// A compact road-transfer hint for the chooser row — shown only when the
// onward drive is long enough to weigh on the choice (>= ~1 h). The full
// last-mile detail stays in State 2.
function roadHint(hubs) {
  const durations = hubs.map(hub => hub.lastMileDurationMinutes).filter(minutes => minutes != null);
  const shortest = durations.length ? Math.min(...durations) : null;
  if (shortest == null || shortest < 60) return '';
  if (hubs.length === 1) return ` · +${durationLabel(shortest).replace('~', '')} road`;
  return ' · + road transfer';
}

function modeSummary(option) {
  if (option.direct) return 'Direct';
  const hubs = option.hubs || [];
  const journey = option.longJourneyNote ? ` · ${journeyHoursLabel(option.longJourneyNote)}` : '';
  if (hubs.length === 1) return `Via ${hubs[0].city}${roadHint(hubs)}${journey}`;
  if (hubs.length > 1) return `Via ${hubs.map(hub => hub.city).join(' / ')}${roadHint(hubs)}${journey}`;
  return 'No direct transport identified';
}

function selectableModeOptions(modeOptions) {
  return modeOptions.filter(option => option.mode !== 'drive' && option.feasible !== false && (
    option.direct || (option.hubs || []).some(hub => hub.feasible !== false)
  ));
}

function ChooserBody({ modeOptions, ruledOutModes, searchCard, onSelectMode }) {
  return (
    <>
      {searchCard}
      <p className="drawer-section-heading">Choose transport</p>
      {modeOptions.length > 0 ? (
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
      ) : (
        <p className="already-booked-note" role="status">No feasible transport identified for this leg.</p>
      )}
      {ruledOutModes.length > 0 && (
        <>
          <p className="drawer-section-heading">Ruled out</p>
          <ul className="transport-ruled-out-list">
            {ruledOutModes.map(option => (
              <li key={option.mode}>
                <ModeTag mode={option.mode} /> {option.ruledOutReason || 'Not available for this route.'}
              </li>
            ))}
          </ul>
        </>
      )}
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

function BookableOptions({ loading, error, options, emptyMessage }) {
  if (loading) {
    return <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>;
  }
  if (error) return <p className="already-booked-note" role="alert">{error}</p>;
  if (options.length === 0) {
    return <p className="already-booked-note" role="status">{emptyMessage}</p>;
  }
  return (
    <div className="stay-options-grid">
      {options.map(option => (
        <TransportOptionCard key={option.mode} option={option} />
      ))}
    </div>
  );
}

function LegacyTransportContext({ leg, hubList, selectedHub, autoOriginHub, onSelectHub }) {
  if (!selectedHub && !autoOriginHub && hubList.length === 0) return null;
  return (
    <TransportContextBand
      leg={leg}
      hubList={hubList}
      selectedHub={selectedHub}
      autoOriginHub={autoOriginHub}
      onSelectHub={onSelectHub}
      mode={selectedHub?.accessGap === 'rail' ? 'train' : 'flight'}
      phase="legacy"
    />
  );
}

function modeFromAccessGap(accessGap) {
  if (accessGap === 'rail') return 'train';
  if (accessGap === 'air') return 'flight';
  return 'flight';
}

function PerModeTransportContext({ leg, currentModeOption, hubList, selectedHub, autoOriginHub, onSelectHub, phase }) {
  const beforeBook = phase === 'before';
  const showBefore = beforeBook && (autoOriginHub || hubList.length > 0);
  const showAfter = !beforeBook && selectedHub?.side !== 'origin';
  if (!showBefore && !showAfter) return null;
  return (
    <TransportContextBand
      leg={leg}
      hubList={hubList}
      selectedHub={selectedHub}
      autoOriginHub={beforeBook ? autoOriginHub : null}
      onSelectHub={onSelectHub}
      mode={currentModeOption?.mode || modeFromAccessGap(selectedHub?.accessGap)}
      phase={phase}
    />
  );
}

function SelectedTransportBody({
  leg, hasPerModeOptions, currentModeOption, hubList,
  selectedHub, autoOriginHub, onSelectHub, options, feasibility, loading,
  error, searchCard,
}) {
  const resolvedOptions = feasibleTransportOptions(options || [], feasibility);
  const activeHubList = currentModeOption?.direct ? [] : hubList;
  const emptyMessage = currentModeOption && !currentModeOption.direct && activeHubList.length === 0
    ? 'No direct transport identified.'
    : activeHubList.length === 0
      ? 'No direct transport identified for this leg.'
      : 'No bookable transport options for this gateway city — try another.';
  return (
    <>
      {searchCard}
      {!hasPerModeOptions && (
        <LegacyTransportContext
          leg={leg}
          hubList={activeHubList}
          selectedHub={selectedHub}
          autoOriginHub={autoOriginHub}
          onSelectHub={onSelectHub}
        />
      )}
      {hasPerModeOptions && (
        <PerModeTransportContext
          leg={leg}
          currentModeOption={currentModeOption}
          hubList={activeHubList}
          selectedHub={selectedHub}
          autoOriginHub={autoOriginHub}
          onSelectHub={onSelectHub}
          phase="before"
        />
      )}
      <p className="drawer-section-heading">Book</p>
      {currentModeOption?.longJourneyNote && <p className="transport-long-journey-note">{currentModeOption.longJourneyNote}</p>}
      <BookableOptions
        loading={loading}
        error={error}
        options={resolvedOptions}
        emptyMessage={emptyMessage}
      />
      {hasPerModeOptions && (
        <PerModeTransportContext
          leg={leg}
          currentModeOption={currentModeOption}
          hubList={[]}
          selectedHub={selectedHub}
          autoOriginHub={autoOriginHub}
          onSelectHub={onSelectHub}
          phase="after"
        />
      )}
      {!hasPerModeOptions && !loading && !error && <NotFeasibleModes modes={MODES.filter(mode => !(feasibility?.modes || []).some(entry => entry.mode === mode && entry.status === 'feasible'))} />}
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
    const chooserModes = selectableModeOptions(modeOptions);
    const modeNames = new Set(chooserModes.map(option => option.mode));
    const ruledOutModes = modeOptions.filter(option => !modeNames.has(option.mode));
    return (
      <BookingDrawer
        ariaLabel={`Transport: ${leg.from} to ${leg.to}`}
        closeLabel="Close transport options"
        title={`${leg.from} → ${leg.to}`}
        onClose={onClose}
      >
        <ChooserBody
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
