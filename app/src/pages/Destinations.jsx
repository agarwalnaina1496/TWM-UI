import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { getRecommendations, TripApiError } from '../lib/tripApi.js';
import { safeMatcherOutcomeViewModel } from '../lib/recommendationViewModel.js';
import { contextRecapPills } from '../lib/tripLifecycle.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import BackToTrip from '../components/BackToTrip.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import '../styles/destinations.css';

const OPEN_ID_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'openId');

const OUTCOME_ICON = { MATCH: '✓', TRADEOFF: '⚠', MISMATCH: '✕' };
const OUTCOME_TONE = { MATCH: 'positive', TRADEOFF: 'caution', MISMATCH: 'negative' };
const BEEN_BEFORE_OPTIONS = [
  { id: 'loved', icon: '❤️', label: 'Loved it' },
  { id: 'would-go-back', icon: '🔁', label: 'Would go back' },
  { id: 'not-for-me', icon: '😐', label: 'Not for me' },
];

function optionLabel(option) {
  return option.type === 'circuit' ? 'Multi-stop circuit' : 'Single destination';
}

function criterionLabel(criteria, criterionId) {
  return criteria.find(c => c.id === criterionId)?.label || criterionId;
}

const CRITERION_ICON = { style: '🎨', budget: '💰', 'travel-time': '✈️', weather: '🌤️', duration: '📅', experience_mix: '🎨', pace: '🧭' };
const criterionIcon = criterionId => CRITERION_ICON[criterionId] || '📌';

const COST_ICON_RULES = [
  [/fuel|road|transport/i, '🚗'], [/stay|hotel|houseboat/i, '🏨'], [/activit/i, '🎟️'],
];
const costIcon = label => (COST_ICON_RULES.find(([re]) => re.test(label)) || [null, '💳'])[1];

function DetailBlock({ detail }) {
  if (detail.type === 'bullets') {
    return (
      <ul className="detail-checklist">
        {detail.items.map(item => <li key={item}>{item}</li>)}
      </ul>
    );
  }
  if (detail.type === 'facts') {
    return (
      <div className="detail-fact-rows">
        {detail.facts.map(f => (
          <div key={f.label} className="detail-fact-row"><span className="fact-icon">📍</span><span className="detail-fact-label">{f.label}</span><span className="detail-fact-value">{f.value}</span></div>
        ))}
      </div>
    );
  }
  if (detail.type === 'cost_breakdown') {
    const currency = detail.currency === 'INR' ? '₹' : detail.currency;
    const isGroupTotal = detail.items.some(item => item.group);
    return (
      <div className="detail-cost-rows">
        <span className="cost-basis">{isGroupTotal ? 'Total party' : 'Per person'}</span>
        {detail.items.map(item => (
          <div key={item.label} className="detail-cost-row">
            <span className="cost-icon">{costIcon(item.label)}</span>
            <span className="cost-label">{item.label}</span>
            <span className="cost-value">≈{currency}{(item.per_person || item.group).minimum.toLocaleString('en-IN')}–{(item.per_person || item.group).maximum.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function moneyRange(range) {
  return `₹${range.minimum.toLocaleString('en-IN')}–₹${range.maximum.toLocaleString('en-IN')}`;
}

function costBreakdownTotal(detail) {
  if (detail.group_total) return detail.group_total;
  const groupItems = detail.items.filter(item => item.group);
  if (!groupItems.length) return null;
  return {
    minimum: groupItems.reduce((sum, item) => sum + item.group.minimum, 0),
    maximum: groupItems.reduce((sum, item) => sum + item.group.maximum, 0),
  };
}

// Heuristic, not a schema guarantee: the largest group cost estimate across
// an option's criteria is treated as its complete-trip estimate for the
// collapsed card. Real Meridian output (TWM-125) places the full round-trip
// breakdown on the budget/affordability criterion, which is normally also
// the largest total among an option's evaluations.
function totalPartyEstimate(option) {
  let best = null;
  option.evaluations.forEach(evaluation => {
    evaluation.details.forEach(detail => {
      if (detail.type !== 'cost_breakdown') return;
      const total = costBreakdownTotal(detail);
      if (total && (!best || total.maximum > best.maximum)) best = total;
    });
  });
  return best;
}

const ACCESS_LABEL_PATTERN = /access|route|connect|transfer|flight|airport|drive|reach/i;

// Heuristic: the first fact whose label reads as access/route information,
// so the collapsed card can show a practical-access line without inventing
// a dedicated "access_summary" field the real contract doesn't have.
function accessFact(option) {
  for (const evaluation of option.evaluations) {
    for (const detail of evaluation.details) {
      if (detail.type !== 'facts') continue;
      const fact = detail.facts.find(f => ACCESS_LABEL_PATTERN.test(f.label));
      if (fact) return fact;
    }
  }
  return null;
}

export default function Destinations() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { updateTrip, commandSnapshot, sendTripCommand, tripLoadStatus, tripLoadError, retryTripLoad, uiState, updateUiState } = useTrip();
  const nextMode = params.get('next') || 'preview'; // 'preview' or 'none'

  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  // Backend-persisted (ui_state[OPEN_ID_KEY]) so it survives a refresh;
  // openId itself stays local React state for instant toggling.
  const [openId, setOpenId] = useState(() => uiState[OPEN_ID_KEY] ?? null);
  const [beenBefore, setBeenBefore] = useState({});
  const [clarifyInput, setClarifyInput] = useState('');
  const [planError, setPlanError] = useState(null);
  const [planningId, setPlanningId] = useState(null);
  const [moreLikeThisId, setMoreLikeThisId] = useState(null);
  const triggered = useRef(false);
  const restoredOpenId = useRef(false);

  const tripState = commandSnapshot?.trip_state;
  const tripId = commandSnapshot?.id;
  const awaiting = tripState?.matcher_state?.conversation_context?.awaiting;
  const lastMeridianMessage = tripState?.matcher_state?.conversation_context?.last_meridian_message;

  // The latest matcher round is fetched lazily (TWM-153) — it no longer
  // rides along on trip_state, since only this page ever needs it.
  const [latest, setLatest] = useState(null);
  const [recoStatus, setRecoStatus] = useState('idle'); // idle | loading | ready | error
  const [recoError, setRecoError] = useState(null);

  // Accepts an explicit id (from a just-created trip's own command response)
  // rather than always trusting the `tripId` closure — ensureTrip() can
  // lazily create the trip mid-command, so the tripId captured when a
  // handler was defined can be stale by the time its promise resolves.
  //
  // `fromCommand` (TWM-149): only a refetch triggered right after a matcher
  // command succeeded represents Meridian actually producing a new round —
  // the passive mount-time fetch below just loads whatever round already
  // existed, so it must not re-fire recommendations_generated.
  const refreshLatest = useCallback(async (idOverride, { fromCommand = false } = {}) => {
    const id = idOverride ?? tripId;
    if (!id) {
      setLatest(null);
      setRecoStatus('ready');
      return null;
    }
    setRecoStatus('loading');
    setRecoError(null);
    try {
      const round = await getRecommendations(id);
      if (fromCommand && round?.options?.length) {
        trackEvent('recommendations_generated', { recommendation_count: round.options.length });
      }
      setLatest(round);
      setRecoStatus('ready');
      return round;
    } catch (error) {
      if (error instanceof TripApiError && error.status === 404) {
        setLatest(null);
        setRecoStatus('ready');
        return null;
      }
      setRecoStatus('error');
      setRecoError(error instanceof TripApiError ? error.message : 'Could not load recommendations.');
      return null;
    }
  }, [tripId]);

  useEffect(() => {
    if (tripLoadStatus !== 'ready') return;
    refreshLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, tripId]);

  function triggerContinue() {
    triggered.current = true;
    setTriggering(true);
    setTriggerError(null);
    return sendTripCommand('continue')
      .then(response => refreshLatest(response.trip?.id, { fromCommand: true }))
      .catch(commandError => { trackFailure('discovery', commandError); setTriggerError(commandError.message || 'Something went wrong.'); })
      .finally(() => setTriggering(false));
  }

  // Trigger matching once per mount if this trip has never reached Meridian,
  // or resume an in-flight clarification round without re-asking. Waits for
  // the lazy recommendations fetch to settle first — otherwise a fresh trip
  // (no round yet) and a trip whose round just hasn't loaded look identical.
  useEffect(() => {
    if (triggered.current || tripLoadStatus !== 'ready' || recoStatus !== 'ready') return;
    if (latest || awaiting) return;
    triggerContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, recoStatus, latest, awaiting]);

  // Restores which card was expanded before a refresh, once, without
  // clobbering a toggle the traveler makes afterward.
  useEffect(() => {
    if (restoredOpenId.current || tripLoadStatus !== 'ready') return;
    restoredOpenId.current = true;
    if (uiState[OPEN_ID_KEY]) setOpenId(uiState[OPEN_ID_KEY]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, uiState[OPEN_ID_KEY]]);

  const outcome = useMemo(
    () => (latest ? safeMatcherOutcomeViewModel(latest) : null),
    [latest]
  );

  // recommendations_viewed fires once per distinct round the traveler is
  // actually shown (freshly generated or resumed from a saved session) —
  // separate from recommendations_generated so backend success can be told
  // apart from the round actually rendering.
  const viewedVersion = useRef(null);
  useEffect(() => {
    if (outcome?.kind !== 'options' || !outcome.data || !latest?.version) return;
    if (viewedVersion.current === latest.version) return;
    viewedVersion.current = latest.version;
    trackEvent('recommendations_viewed', { recommendation_count: outcome.data.options.length });
  }, [outcome, latest?.version]);

  const pills = contextRecapPills(tripState?.trip_context);
  const selectedOption = tripState?.trip_context?.selected_option ?? null;

  function toggleBeenBefore(key, id) {
    setBeenBefore(previous => ({ ...previous, [key]: previous[key] === id ? null : id }));
  }

  function toggleOpen(key) {
    const next = openId === key ? null : key;
    setOpenId(next);
    updateUiState({ [OPEN_ID_KEY]: next }).catch(() => {});
  }

  async function planThis(option) {
    setPlanError(null);
    setPlanningId(option.key);
    try {
      await sendTripCommand('select_destination', { optionId: option.key });
      trackEvent('destination_selected', { selection_source: 'plan_this_trip' });
      // Display-only field read by Itinerary/Logistics/RequestQuote; TWM-106
      // moved the Plan Builder itself onto Backend-persisted trip_context.
      updateTrip({ destination: { type: option.type, name: option.name } });
      navigate('/trip-preview');
    } catch (commandError) {
      setPlanError(commandError.message || 'Something went wrong.');
    } finally {
      setPlanningId(null);
    }
  }

  async function moreLikeThis(option) {
    setMoreLikeThisId(option.key);
    setPlanError(null);
    try {
      const response = await sendTripCommand('more_like_this', {
        refinement: { type: 'MORE_LIKE_THIS', reference: { type: option.type, id: option.key } },
      });
      await refreshLatest(response.trip?.id, { fromCommand: true });
      setOpenId(null);
      updateUiState({ [OPEN_ID_KEY]: null }).catch(() => {});
    } catch (commandError) {
      setPlanError(commandError.message || 'Something went wrong.');
    } finally {
      setMoreLikeThisId(null);
    }
  }

  async function submitClarification() {
    const value = clarifyInput.trim();
    if (!value) return;
    setClarifyInput('');
    setTriggerError(null);
    setTriggering(true);
    try {
      const response = await sendTripCommand('traveler_message', { message: value });
      await refreshLatest(response.trip?.id, { fromCommand: true });
    } catch (commandError) {
      setTriggerError(commandError.message || 'Something went wrong.');
    } finally {
      setTriggering(false);
    }
  }

  const thinking = tripLoadStatus === 'loading' || recoStatus === 'loading' || triggering
    || (tripLoadStatus === 'ready' && recoStatus === 'ready' && !latest && !awaiting && !triggerError);
  const showTripLoadError = tripLoadStatus === 'error';
  const showRecoError = !showTripLoadError && recoStatus === 'error';

  return (
    <div className="wrap">
      <BackToTrip />
      <span className="eyebrow">Destination matcher</span>
      <h1>Let's find <em>your</em> place</h1>
      <p className="lede">Matching against what you just told me — ranked by how well each fits.</p>
      {pills.length > 0 && <div className="trip-recap">{pills.map(p => <span key={p} className="recap-pill">{p}</span>)}</div>}

      {showTripLoadError && (
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Trip could not be loaded</strong>
          <span>{tripLoadError?.message || 'Something went wrong.'}</span>
          <button type="button" className="btn btn-ghost" onClick={retryTripLoad}>Try again</button>
        </div>
      )}

      {showRecoError && (
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Recommendations unavailable</strong>
          <span>{recoError}</span>
          <button type="button" className="btn btn-ghost" onClick={refreshLatest}>Try again</button>
        </div>
      )}

      {!showTripLoadError && !showRecoError && thinking && (
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Matching destinations to your answers…</div>
      )}

      {!showTripLoadError && !showRecoError && !thinking && triggerError && (
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Recommendations unavailable</strong>
          <span>{triggerError}</span>
          <button type="button" className="btn btn-ghost" onClick={triggerContinue}>Try again</button>
        </div>
      )}

      {!showTripLoadError && !showRecoError && !thinking && !triggerError && awaiting && !latest && (
        <div className="chat-log" aria-live="polite">
          <div className="chat-row chat-row-assistant"><div className="chat-bub chat-bub-assistant" style={{ whiteSpace: 'pre-wrap' }}>{lastMeridianMessage}</div></div>
          <div className="chat-input-bar">
            <input type="text" className="chat-input" placeholder="Your answer…" value={clarifyInput} onChange={event => setClarifyInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitClarification(); }} />
            <button type="button" className="chat-send" onClick={submitClarification} aria-label="Send">→</button>
          </div>
        </div>
      )}

      {!showTripLoadError && !showRecoError && !thinking && !triggerError && outcome?.kind === 'failure' && (
        <div className="price-evidence state-unsafe" role="alert">
          <strong>{outcome.data.message}</strong>
          {outcome.data.constraintAdjustmentSuggestions.length > 0 && (
            <ul className="detail-checklist">
              {outcome.data.constraintAdjustmentSuggestions.map(suggestion => <li key={suggestion}>{suggestion}</li>)}
            </ul>
          )}
          <div className="chat-input-bar">
            <input type="text" className="chat-input" placeholder="Adjust and try again…" value={clarifyInput} onChange={event => setClarifyInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitClarification(); }} />
            <button type="button" className="chat-send" onClick={submitClarification} aria-label="Send">→</button>
          </div>
        </div>
      )}

      {!showTripLoadError && !showRecoError && !thinking && !triggerError && outcome?.kind === 'options' && outcome.error && (
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Recommendations unavailable</strong>
          <span>We could not validate the recommendation response safely. Please try again.</span>
        </div>
      )}

      {!showTripLoadError && !showRecoError && !thinking && !triggerError && outcome?.kind === 'options' && outcome.data && (
        <div>
          <h2 className="section-title">A few that fit well</h2>
          <p className="lede recommendation-summary">{outcome.data.message}</p>
          {planError && <div className="price-evidence state-unsafe" role="alert">{planError}</div>}
          {outcome.data.options.map((d, i) => {
            const isBest = i === 0 && outcome.data.status === 'SUCCESS';
            const isOpen = openId === d.key;
            const isSelected = selectedOption && selectedOption.type === d.type && selectedOption.id === d.key;
            const totalEstimate = totalPartyEstimate(d);
            const access = accessFact(d);
            const travelers = tripState?.trip_context?.travelers;
            return (
              <div key={d.key} className={`dest-card${isBest ? ' best' : ''}`}>
                {isSelected ? <span className="pick-badge">Selected</span> : isBest && <span className="pick-badge">Our pick</span>}
                <div className="dest-name">{d.name}</div>
                <div className="dest-tag">{optionLabel(d)}</div>
                <p className="dest-summary">{d.summary}</p>
                {(totalEstimate || access) && (
                  <div className="decision-facts">
                    {totalEstimate && <span><strong>{moneyRange(totalEstimate)}</strong> estimated total{travelers ? ` for ${travelers}` : ''}</span>}
                    {access && <span>{access.value}</span>}
                  </div>
                )}
                <div className="estimate-qualifier">Qualified planning estimate · not checked prices</div>
                <div className="criteria-list">
                  {d.evaluations.map(ev => (
                    <StatusPill key={ev.criterion_id} tone={OUTCOME_TONE[ev.outcome]} icon={OUTCOME_ICON[ev.outcome]}>
                      {criterionLabel(outcome.data.criteria, ev.criterion_id)}
                    </StatusPill>
                  ))}
                  {d.other_considerations.length > 0 && (
                    <span
                      className="criteria-pill outcome-more"
                      title={d.other_considerations.join(' · ')}
                    >
                      +{d.other_considerations.length} other consideration{d.other_considerations.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <button type="button" className="reason-toggle" onClick={() => toggleOpen(d.key)}>
                  Why this one <span>{isOpen ? '▴' : '▾'}</span>
                </button>
                {isOpen && (
                  <div className="reason-body open">
                    {d.evaluations.map(ev => (
                      <div key={ev.criterion_id} className="eval-block">
                        <div className="eval-head">
                          <span className="eval-icon">{criterionIcon(ev.criterion_id)}</span>
                          <span className="eval-conclusion">{ev.conclusion}</span>
                          <StatusPill tone={OUTCOME_TONE[ev.outcome]} icon={OUTCOME_ICON[ev.outcome]}>{ev.outcome.toLowerCase()}</StatusPill>
                        </div>
                        {ev.details.map((detail, di) => <DetailBlock key={di} detail={detail} />)}
                        {ev.tradeoffs?.map(t => <div key={t} className="eval-tradeoff">⚠ {t}</div>)}
                      </div>
                    ))}
                    {d.other_considerations.length > 0 && (
                      <div className="other-considerations">
                        <div className="other-considerations-title">Other considerations</div>
                        <div className="detail-tags">
                          {d.other_considerations.map(o => <span key={o} className="detail-tag">{o}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="dest-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => moreLikeThis(d)} disabled={moreLikeThisId === d.key}>✨ More like this</button>
                  {isSelected
                    ? <button type="button" className="btn btn-primary" onClick={() => navigate('/trip-preview')}>Continue planning →</button>
                    : nextMode === 'preview'
                      ? <button type="button" className="btn btn-primary" onClick={() => planThis(d)} disabled={planningId === d.key}>Plan this trip →</button>
                      : <Link className="btn btn-primary" to="/trip-preview" onClick={() => { sendTripCommand('select_destination', { optionId: d.key }).catch(() => {}); trackEvent('destination_selected', { selection_source: 'want_to_plan_this' }); updateTrip({ destination: { type: d.type, name: d.name } }); }}>Want to plan this? →</Link>}
                </div>
                <div className="been-before">
                  <span className="been-before-label">Been here before? <em>tell us how it was</em></span>
                  <div className="been-before-opts">
                    {BEEN_BEFORE_OPTIONS.map(opt => (
                      <button type="button" key={opt.id} className={`been-before-pill${beenBefore[d.key] === opt.id ? ' selected' : ''}`} onClick={() => toggleBeenBefore(d.key, opt.id)}>
                        <span>{opt.icon}</span>{opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
