import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { getRecommendations, TripApiError } from '../lib/tripApi.js';
import { safeMatcherOutcomeViewModel, rollupSummary } from '../lib/recommendationViewModel.js';
import { contextRecapPills } from '../lib/tripLifecycle.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import { isFixedFieldGap } from '../lib/planChat.js';
import { planReady } from '../hooks/useGuidePlanning.js';
import BackToTrip from '../components/BackToTrip.jsx';
import Layout from '../components/Layout.jsx';
import StatusPill from '../components/ui/StatusPill.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../lib/useTripFromUrl.js';
import '../styles/destinations.css';

const FOCUSED_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'focusedKey');
const EVIDENCE_OPEN_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'evidenceOpen');

const OUTCOME_ICON = { MATCH: '✓', TRADEOFF: '⚠', MISMATCH: '✕' };
const OUTCOME_TONE = { MATCH: 'positive', TRADEOFF: 'caution', MISMATCH: 'negative' };
const BEEN_BEFORE_OPTIONS = [
  { id: 'loved', icon: '❤️', label: 'Loved it' },
  { id: 'would-go-back', icon: '🔁', label: 'Would go back' },
  { id: 'not-for-me', icon: '😐', label: 'Not for me' },
];
const MATCHING_STEPS = ['Reviewing what you told us', 'Matching against real destinations', 'Ranking by fit'];

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

const ACCESS_LABEL_PATTERN = /access|route|connect|transfer|flight|airport|drive|reach/i;

// Heuristic: the first fact whose label reads as access/route information,
// so the detail card can show a practical-access line without inventing a
// dedicated "access_summary" field the real contract doesn't have.
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

// TWM-173: criteria (rows) x options (columns) comparison matrix, replacing
// three full-width stacked cards. Clicking an option's header focuses it —
// the detail card below stays in sync with whichever column is focused.
function ComparisonMatrix({ criteria, options, focusedKey, onFocus }) {
  return (
    <div className="matrix-wrap">
      <table className="comparison-matrix">
        <thead>
          <tr>
            <th className="matrix-corner" scope="col" />
            {options.map(option => (
              <th key={option.key} className={option.key === focusedKey ? 'focused' : ''} scope="col">
                <button type="button" className="matrix-option-header" onClick={() => onFocus(option.key)} aria-pressed={option.key === focusedKey}>
                  <span className="matrix-option-rank">#{option.rank}</span>
                  <span className="matrix-option-name">{option.name}</span>
                  <span className="matrix-option-type">{optionLabel(option)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {criteria.map(criterion => (
            <tr key={criterion.id}>
              <th className="matrix-criterion-label" scope="row">{criterion.label}</th>
              {options.map(option => {
                const evaluation = option.evaluations.find(ev => ev.criterion_id === criterion.id);
                return (
                  <td key={option.key} className={option.key === focusedKey ? 'focused' : ''}>
                    {evaluation && (
                      <StatusPill tone={OUTCOME_TONE[evaluation.outcome]} icon={OUTCOME_ICON[evaluation.outcome]} variant="outline">
                        {evaluation.outcome.toLowerCase()}
                      </StatusPill>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// TWM-173: collapsed by default — name, type, rank, one-line summary, and
// the single "Plan this trip →" CTA are all immediately visible without
// expanding anything. Full evidence sits behind "See why this fits ▾".
function OptionDetailCard({
  option, criteria, isSelected, evidenceOpen, onToggleEvidence, onPlan, planning,
  moreLikeThisQualifier, onQualifierChange, onMoreLikeThis, moreLikeThisBusy,
  beenBefore, onToggleBeenBefore, travelers,
}) {
  const access = accessFact(option);
  return (
    <div className="dest-detail-card">
      {isSelected && <span className="pick-badge">Selected</span>}
      <div className="dest-name">{option.name}</div>
      <div className="dest-tag">{optionLabel(option)} · Rank #{option.rank}</div>
      <p className="dest-summary">{option.summary}</p>
      {access && <div className="decision-facts"><span>{access.value}</span></div>}
      <div className="rollup-summary">{rollupSummary(option.evaluations)}{travelers ? ` for ${travelers}` : ''}</div>

      <button type="button" className="reason-toggle" onClick={onToggleEvidence}>
        See why this fits <span>{evidenceOpen ? '▴' : '▾'}</span>
      </button>
      {evidenceOpen && (
        <div className="reason-body open">
          {option.evaluations.map(ev => (
            <div key={ev.criterion_id} className="eval-block">
              <div className="eval-head">
                <span className="eval-icon">{criterionIcon(ev.criterion_id)}</span>
                <span className="eval-conclusion">{criterionLabel(criteria, ev.criterion_id)}: {ev.conclusion}</span>
                <StatusPill tone={OUTCOME_TONE[ev.outcome]} icon={OUTCOME_ICON[ev.outcome]}>{ev.outcome.toLowerCase()}</StatusPill>
              </div>
              {ev.details.map((detail, di) => <DetailBlock key={di} detail={detail} />)}
              {ev.tradeoffs?.map(t => <div key={t} className="eval-tradeoff">⚠ {t}</div>)}
            </div>
          ))}
          {option.other_considerations.length > 0 && (
            <div className="other-considerations">
              <div className="other-considerations-title">Other considerations</div>
              <div className="detail-tags">
                {option.other_considerations.map(o => <span key={o} className="detail-tag">{o}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="more-like-this-row">
        <input
          type="text"
          className="more-like-this-input"
          placeholder="Optional: cheaper, closer, slower…"
          aria-label={`Refine ${option.name}`}
          value={moreLikeThisQualifier}
          onChange={event => onQualifierChange(event.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={onMoreLikeThis} disabled={moreLikeThisBusy}>✨ More like this</button>
      </div>

      {/* TWM-173: one consistent literal CTA regardless of state — the
          former three-way "Continue planning"/"Plan this trip"/"Want to
          plan this?" split was implementation-path noise, not a real
          state difference the traveler needed to see. */}
      <div className="dest-actions">
        <button type="button" className="btn btn-primary" onClick={onPlan} disabled={planning}>Plan this trip →</button>
      </div>

      <div className="been-before">
        <span className="been-before-label">Been here before? <em>tell us how it was</em></span>
        <div className="been-before-opts">
          {BEEN_BEFORE_OPTIONS.map(opt => (
            <button type="button" key={opt.id} className={`been-before-pill${beenBefore === opt.id ? ' selected' : ''}`} onClick={() => onToggleBeenBefore(opt.id)}>
              <span>{opt.icon}</span>{opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// TWM-173: always present regardless of result state — open comparison or
// refinement with no specific option in mind, distinct from the per-option
// "More like this" qualifier.
function RefinementDrawer({ open, onToggle, value, onChange, onSubmit, busy }) {
  return (
    <div className="refinement-drawer">
      <button type="button" className="refinement-toggle" onClick={onToggle} aria-expanded={open}>
        Not quite right? Tell us more <span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="refinement-body">
          <textarea
            className="refinement-input"
            aria-label="Tell us more"
            placeholder="e.g. I'd rather avoid long overnight trains, or I want somewhere quieter…"
            value={value}
            onChange={event => onChange(event.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={busy || !value.trim()}>Send</button>
        </div>
      )}
    </div>
  );
}

// TWM-174: a transient overlay over Destinations, shown only when Guide's
// fixed-checklist gate finds one genuinely missing field that Meridian's
// judgment-based gate never needed — not a new screen, not logic embedded
// in Plan Builder. Known facts render as read-only chips; only the single
// missing field is asked.
function CheckpointOverlay({ knownFacts, message, value, onChange, onSubmit, busy, error }) {
  const cardRef = useRef(null);
  const inputRef = useRef(null);

  // aria-modal="true" is a promise that focus stays contained — this is a
  // required gate with no dismiss affordance (nothing valid to Escape back
  // to), so: autofocus the input on open and whenever a new field is asked,
  // and trap Tab within the card rather than letting it reach the blurred
  // Destinations content behind the scrim.
  useEffect(() => {
    inputRef.current?.focus();
  }, [message]);

  function onKeyDown(event) {
    if (event.key !== 'Tab') return;
    const focusable = cardRef.current?.querySelectorAll('input:not(:disabled), button:not(:disabled)');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit() {
    if (!value.trim()) return;
    onSubmit();
  }

  return (
    <div className="checkpoint-overlay" role="dialog" aria-modal="true" aria-label="One more thing before we plan">
      <div className="checkpoint-card" ref={cardRef} onKeyDown={onKeyDown}>
        <span className="eyebrow">One more thing</span>
        {knownFacts.length > 0 && (
          <div className="checkpoint-known-facts">
            {knownFacts.map(fact => <span key={fact} className="checkpoint-fact-chip">{fact}</span>)}
          </div>
        )}
        <p className="checkpoint-message">{message || 'Guide needs one more detail before it can propose a plan.'}</p>
        {error && <div className="price-evidence state-unsafe" role="alert">{error}</div>}
        <div className="checkpoint-input-row">
          <input
            ref={inputRef}
            type="text"
            aria-label="Your answer"
            placeholder="Your answer…"
            value={value}
            disabled={busy}
            onChange={event => onChange(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') submit(); }}
          />
          <button type="button" className="btn btn-primary" disabled={busy || !value.trim()} onClick={submit}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default function Destinations() {
  const navigate = useNavigate();
  const { updateTrip, commandSnapshot, sendTripCommand, tripLoadStatus, tripLoadError, retryTripLoad, uiState, updateUiState, openTrip } = useTrip();
  // TWM-185: reload/bookmark/deep-link safe — a full fetch, since this page
  // triggers matching/reads matcher_state to decide what to do next.
  useTripFromUrl(openTrip);

  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  // Backend-persisted so both survive a refresh; local React state for
  // instant interaction.
  const [focusedKey, setFocusedKey] = useState(() => uiState[FOCUSED_KEY] ?? null);
  const [evidenceOpen, setEvidenceOpen] = useState(() => !!uiState[EVIDENCE_OPEN_KEY]);
  const [beenBefore, setBeenBefore] = useState({});
  const [clarifyInput, setClarifyInput] = useState('');
  const [planError, setPlanError] = useState(null);
  const [planningId, setPlanningId] = useState(null);
  const [checkpointAwaiting, setCheckpointAwaiting] = useState(null);
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [checkpointInput, setCheckpointInput] = useState('');
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointError, setCheckpointError] = useState(null);
  const trackedCheckpointFields = useRef(new Set());
  const checkpointWasShown = useRef(false);
  const [moreLikeThisId, setMoreLikeThisId] = useState(null);
  const [moreLikeThisQualifier, setMoreLikeThisQualifier] = useState('');
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [refinementValue, setRefinementValue] = useState('');
  const [refinementBusy, setRefinementBusy] = useState(false);
  const triggered = useRef(false);
  const restoredFocus = useRef(false);
  const trackedFailureStatus = useRef(null);
  const trackedTransitionShown = useRef(false);

  const tripState = commandSnapshot?.trip_state;
  const tripId = commandSnapshot?.id;
  const awaiting = tripState?.matcher_state?.conversation_context?.awaiting;
  const lastMeridianMessage = tripState?.matcher_state?.conversation_context?.last_meridian_message;

  // The latest matcher round is fetched lazily (TWM-153) — it no longer
  // rides along on trip_state, since only this page ever needs it.
  const [latest, setLatest] = useState(null);
  const [recoStatus, setRecoStatus] = useState('idle'); // idle | loading | ready | error
  const [recoError, setRecoError] = useState(null);

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

  // Restores which option was focused (and whether its evidence was open)
  // before a refresh, once, without clobbering a toggle the traveler makes
  // afterward.
  useEffect(() => {
    if (restoredFocus.current || tripLoadStatus !== 'ready') return;
    restoredFocus.current = true;
    if (uiState[FOCUSED_KEY]) setFocusedKey(uiState[FOCUSED_KEY]);
    if (uiState[EVIDENCE_OPEN_KEY]) setEvidenceOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, uiState[FOCUSED_KEY], uiState[EVIDENCE_OPEN_KEY]]);

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

  useEffect(() => {
    if (outcome?.kind !== 'failure' || !outcome.data) return;
    if (trackedFailureStatus.current === outcome.data.status) return;
    trackedFailureStatus.current = outcome.data.status;
    trackEvent('terminal_failure_shown', { status: outcome.data.status });
  }, [outcome]);

  // Once options are known, default focus to the best-ranked option so the
  // detail card always shows something rather than nothing.
  useEffect(() => {
    if (focusedKey || outcome?.kind !== 'options' || !outcome.data) return;
    setFocusedKey(outcome.data.options[0]?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  const pills = contextRecapPills(tripState?.trip_context);
  const selectedOption = tripState?.trip_context?.selected_option ?? null;

  function focusOption(key) {
    if (key === focusedKey) return;
    setFocusedKey(key);
    setEvidenceOpen(false);
    updateUiState({ [FOCUSED_KEY]: key, [EVIDENCE_OPEN_KEY]: false }).catch(() => {});
  }

  // Persists both keys together, always — evidenceOpen alone would be
  // ambiguous about *which* option it belongs to after a refresh. Persists
  // focusedOption's key (what's actually on screen, falling back to
  // options[0]) rather than the raw focusedKey state — the auto-focus
  // effect above hasn't necessarily committed yet on the very first
  // toggle, so focusedKey can still be null while the card already shows
  // the top-ranked option.
  function toggleEvidence() {
    const next = !evidenceOpen;
    setEvidenceOpen(next);
    updateUiState({ [FOCUSED_KEY]: focusedOption?.key ?? null, [EVIDENCE_OPEN_KEY]: next }).catch(() => {});
  }

  // TWM-173: one unified CTA — an already-selected option just navigates
  // (no re-selection needed); every other option runs select_destination
  // first. Same literal "Plan this trip →" text either way.
  function planThis(option) {
    const isSelected = selectedOption && selectedOption.type === option.type && selectedOption.id === option.key;
    if (isSelected) {
      navigate(withTripId('/trip-preview', commandSnapshot?.id));
      return;
    }
    doPlanThis(option);
  }

  // TWM-174: bootstraps Guide immediately (instead of leaving it to
  // TripPreview's own mount) so the checkpoint gap — if any — can surface
  // right here on Destinations, before navigating away. TripPreview's own
  // boot effect already no-ops once plannerState/awaiting exists, so this
  // doesn't double-start Guide.
  async function doPlanThis(option) {
    setPlanError(null);
    setPlanningId(option.key);
    try {
      await sendTripCommand('select_destination', { optionId: option.key });
      trackEvent('destination_selected', { selection_source: 'plan_this_trip' });
      // Display-only field read by Itinerary/Logistics/RequestQuote; TWM-106
      // moved the Plan Builder itself onto Backend-persisted trip_context.
      updateTrip({ destination: { type: option.type, name: option.name } });
      const response = await sendTripCommand('start_planning');
      proceedFromGuideResponse(response);
    } catch (commandError) {
      setPlanError(commandError.message || 'Something went wrong.');
    } finally {
      setPlanningId(null);
    }
  }

  // Shared by both the initial start_planning bootstrap and each checkpoint
  // answer — Guide gates one fixed field at a time, so a single answer may
  // reveal another gap before all five are satisfied.
  function proceedFromGuideResponse(response) {
    const plannerState = response.trip?.trip_state?.planner_state;
    const nextAwaiting = plannerState?.conversation_context?.awaiting;
    // Guide can clear the fixed-field checkpoint gate on the same turn it
    // finishes the plan — planReady must win over isFixedFieldGap, or a
    // completed plan gets stuck showing a stale checkpoint prompt.
    if (!planReady(plannerState) && isFixedFieldGap(nextAwaiting)) {
      setCheckpointAwaiting(nextAwaiting);
      setCheckpointMessage(response.message || '');
      checkpointWasShown.current = true;
      if (!trackedCheckpointFields.current.has(nextAwaiting)) {
        trackedCheckpointFields.current.add(nextAwaiting);
        trackEvent('checkpoint_shown', { field: nextAwaiting });
      }
      return;
    }
    if (checkpointWasShown.current) trackEvent('checkpoint_resolved', {});
    setCheckpointAwaiting(null);
    navigate(withTripId('/trip-preview', response.trip?.id ?? commandSnapshot?.id), { state: { guideMessage: response.message } });
  }

  async function submitCheckpoint() {
    const value = checkpointInput.trim();
    if (!value) return;
    setCheckpointBusy(true);
    setCheckpointError(null);
    setCheckpointInput('');
    try {
      const response = await sendTripCommand('traveler_message', { message: value });
      proceedFromGuideResponse(response);
    } catch (commandError) {
      setCheckpointError(commandError.message || 'Something went wrong.');
    } finally {
      setCheckpointBusy(false);
    }
  }

  async function moreLikeThis(option) {
    setMoreLikeThisId(option.key);
    setPlanError(null);
    const instructions = moreLikeThisQualifier.trim();
    try {
      const response = await sendTripCommand('more_like_this', {
        refinement: {
          type: 'MORE_LIKE_THIS',
          reference: { type: option.type, id: option.key },
          ...(instructions ? { instructions } : {}),
        },
      });
      trackEvent('more_like_this_used', { with_qualifier: Boolean(instructions) });
      await refreshLatest(response.trip?.id, { fromCommand: true });
      setMoreLikeThisQualifier('');
      setFocusedKey(null);
      setEvidenceOpen(false);
      updateUiState({ [FOCUSED_KEY]: null, [EVIDENCE_OPEN_KEY]: false }).catch(() => {});
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

  async function submitRefinement() {
    const value = refinementValue.trim();
    if (!value) return;
    setRefinementValue('');
    setRefinementBusy(true);
    setPlanError(null);
    try {
      trackEvent('refinement_drawer_used', {});
      const response = await sendTripCommand('traveler_message', { message: value });
      await refreshLatest(response.trip?.id, { fromCommand: true });
      setRefinementOpen(false);
    } catch (commandError) {
      setPlanError(commandError.message || 'Something went wrong.');
    } finally {
      setRefinementBusy(false);
    }
  }

  function tapFailureChip(suggestion, status) {
    trackEvent('terminal_failure_chip_tapped', { status });
    setClarifyInput(suggestion);
  }

  const thinking = tripLoadStatus === 'loading' || recoStatus === 'loading' || triggering
    || (tripLoadStatus === 'ready' && recoStatus === 'ready' && !latest && !awaiting && !triggerError);

  // TWM-173: this trigger point is the initial Discover entry. The Direct-
  // Plan reversal link (Guide's reopen_destination_discovery, per TWM-174)
  // should fire this same component/event with trigger: 'destination_reversal'
  // once that link exists, so funnel analysis can tell the two apart.
  useEffect(() => {
    if (!thinking || trackedTransitionShown.current) return;
    trackedTransitionShown.current = true;
    trackEvent('honest_transition_shown', { trigger: 'initial_discover' });
  }, [thinking]);

  const showTripLoadError = tripLoadStatus === 'error';
  const showRecoError = !showTripLoadError && recoStatus === 'error';
  const focusedOption = outcome?.kind === 'options' && outcome.data
    ? outcome.data.options.find(o => o.key === focusedKey) ?? outcome.data.options[0]
    : null;
  const isFocusedSelected = focusedOption && selectedOption
    && selectedOption.type === focusedOption.type && selectedOption.id === focusedOption.key;

  return (
    <Layout>
      {checkpointAwaiting && (
        <CheckpointOverlay
          knownFacts={pills}
          message={checkpointMessage}
          value={checkpointInput}
          onChange={setCheckpointInput}
          onSubmit={submitCheckpoint}
          busy={checkpointBusy}
          error={checkpointError}
        />
      )}
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
        <HonestTransition steps={MATCHING_STEPS} label="Finding your matches" />
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
        <div className="terminal-failure" role="alert">
          <span className="terminal-failure-badge">Scout</span>
          <strong>{outcome.data.message}</strong>
          {outcome.data.constraintAdjustmentSuggestions.length > 0 && (
            <div className="terminal-failure-chips">
              {outcome.data.constraintAdjustmentSuggestions.map(suggestion => (
                <button type="button" key={suggestion} className="chip" onClick={() => tapFailureChip(suggestion, outcome.data.status)}>{suggestion}</button>
              ))}
            </div>
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

          <ComparisonMatrix criteria={outcome.data.criteria} options={outcome.data.options} focusedKey={focusedOption?.key} onFocus={focusOption} />

          {focusedOption && (
            <OptionDetailCard
              option={focusedOption}
              criteria={outcome.data.criteria}
              isSelected={isFocusedSelected}
              evidenceOpen={evidenceOpen}
              onToggleEvidence={toggleEvidence}
              onPlan={() => planThis(focusedOption)}
              planning={planningId === focusedOption.key}
              moreLikeThisQualifier={moreLikeThisQualifier}
              onQualifierChange={setMoreLikeThisQualifier}
              onMoreLikeThis={() => moreLikeThis(focusedOption)}
              moreLikeThisBusy={moreLikeThisId === focusedOption.key}
              beenBefore={beenBefore[focusedOption.key] ?? null}
              onToggleBeenBefore={id => setBeenBefore(previous => ({ ...previous, [focusedOption.key]: previous[focusedOption.key] === id ? null : id }))}
              travelers={tripState?.trip_context?.travelers}
            />
          )}
        </div>
      )}

      {!showTripLoadError && !thinking && (
        <RefinementDrawer
          open={refinementOpen}
          onToggle={() => setRefinementOpen(open => !open)}
          value={refinementValue}
          onChange={setRefinementValue}
          onSubmit={submitRefinement}
          busy={refinementBusy}
        />
      )}
    </Layout>
  );
}
