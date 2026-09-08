import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { useRecommendationsQuery } from '../hooks/tripQueries.js';
import { safeMatcherOutcomeViewModel } from '../lib/recommendationViewModel.js';
import { contextRecapPills } from '../lib/tripLifecycle.js';
import { trackEvent, trackFailure } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';
import { isFixedFieldGap } from '../lib/planChat.js';
import { planReady } from '../hooks/useGuidePlanning.js';
import BackToTrip from '../components/BackToTrip.jsx';
import Layout from '../components/Layout.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import ComparisonMatrix from '../components/destinations/ComparisonMatrix.jsx';
import OptionDetailCard from '../components/destinations/OptionDetailCard.jsx';
import RefinementDrawer from '../components/destinations/RefinementDrawer.jsx';
import CheckpointOverlay from '../components/destinations/CheckpointOverlay.jsx';
import { withTripId } from '../lib/tripUrl.js';
import { useTripFromUrl } from '../hooks/useTripFromUrl.js';
import '../styles/destinations.css';

const FOCUSED_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'focusedKey');
const EVIDENCE_OPEN_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'evidenceOpen');

const MATCHING_STEPS = ['Reviewing what you told us', 'Matching against real destinations', 'Ranking by fit'];


export default function Destinations() {
  const navigate = useNavigate();
  const { commandSnapshot: view, sendTripCommand, tripLoadStatus, tripLoadError, retryTripLoad, uiState, updateUiState } = useTrip();
  // TWM-185/TWM-221: reload/bookmark/deep-link safe — points currentTripId at
  // the URL's trip so the ['trip', id] query resolves the right one.
  useTripFromUrl();

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

  const tripId = view?.id;
  const awaiting = view?.matcher?.awaiting;
  const lastMeridianMessage = view?.matcher?.last_message;

  // TWM-221: the matcher round is a React Query read (['recommendations',
  // id]) — lazy on mount, request-deduped. After a command it is written
  // straight into that cache by TripContext's sendTripCommand; a turn that
  // produced no round leaves the current one in place and the fresh
  // `view.matcher` drives the clarification UI.
  const recommendationsQuery = useRecommendationsQuery(tripId);
  const latest = recommendationsQuery.data ?? null;
  const recoStatus = !tripId
    ? 'ready'
    : recommendationsQuery.isError
      ? 'error'
      : recommendationsQuery.data !== undefined
        ? 'ready'
        : 'loading';
  const recoError = recommendationsQuery.error?.message || 'Could not load recommendations.';
  const refreshLatest = recommendationsQuery.refetch;

  // A command turn's round is already in the ['recommendations', id] cache
  // by the time this runs; fire the generated-count analytics only.
  const applyCommandRound = useCallback(round => {
    if (round?.options?.length) {
      trackEvent('recommendations_generated', { recommendation_count: round.options.length });
    }
  }, []);

  function triggerContinue() {
    triggered.current = true;
    setTriggering(true);
    setTriggerError(null);
    return sendTripCommand('continue')
      .then(response => applyCommandRound(response.recommendation))
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

  const pills = contextRecapPills(view);
  const selectedOption = view?.lifecycle?.selected_option ?? null;

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
      // TWM-190: route by artifact existence — a prior planning session with
      // no day_plan yet still belongs on ScoutChat's chat window, not the
      // (now day_plan-only) Plan Builder.
      const destination = planReady(view?.plan) ? '/trip-preview' : '/scout-chat';
      navigate(withTripId(destination, view?.id));
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
    const nextPlan = response.trip?.plan;
    const nextAwaiting = nextPlan?.awaiting;
    // Guide can clear the fixed-field checkpoint gate on the same turn it
    // finishes the plan — planReady must win over isFixedFieldGap, or a
    // completed plan gets stuck showing a stale checkpoint prompt.
    if (!planReady(nextPlan) && isFixedFieldGap(nextAwaiting)) {
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
    const tripId = response.trip?.id ?? view?.id;
    if (planReady(nextPlan)) {
      navigate(withTripId('/trip-preview', tripId), { state: { guideMessage: response.message } });
      return;
    }
    // TWM-190: Guide still needs more before it can propose a plan — that
    // conversation now lives on ScoutChat (its own recap picks up the
    // current awaiting question from trip_state), not TripPreview's
    // retired inline gating branch.
    navigate(withTripId('/scout-chat', tripId));
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
      applyCommandRound(response.recommendation);
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
      applyCommandRound(response.recommendation);
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
      applyCommandRound(response.recommendation);
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

  // recoStatus starts 'idle' before the lazy recommendations fetch effect
  // has even fired — treating it as equivalent to "settled" here let
  // awaiting-driven content (e.g. a clarification question, already known
  // from trip_state's own matcher_state) render before that fetch was even
  // dispatched, a real race exposed by a flaky CI assertion on fetch count.
  const recoSettled = recoStatus === 'ready' || recoStatus === 'error';
  const thinking = tripLoadStatus === 'loading' || !recoSettled || triggering
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
              travelers={view?.context_recap?.find(r => r.key === 'num_travelers')?.value}
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
