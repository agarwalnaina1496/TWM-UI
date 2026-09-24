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
import ScreenHeader from '../components/ui/ScreenHeader.jsx';
import Layout from '../components/Layout.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import OptionDetailCard from '../components/destinations/OptionDetailCard.jsx';
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
  useTripFromUrl();

  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const [focusedKey, setFocusedKey] = useState(() => uiState[FOCUSED_KEY] ?? null);
  const [evidenceOpen, setEvidenceOpen] = useState(() => !!uiState[EVIDENCE_OPEN_KEY]);
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
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [refinementValue, setRefinementValue] = useState('');
  const [refinementScope, setRefinementScope] = useState(null);
  const [refinementBusy, setRefinementBusy] = useState(false);
  const triggered = useRef(false);
  const restoredFocus = useRef(false);
  const trackedFailureStatus = useRef(null);
  const trackedTransitionShown = useRef(false);

  const tripId = view?.id;
  const awaiting = view?.matcher?.awaiting;
  const lastMeridianMessage = view?.matcher?.last_message;

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

  useEffect(() => {
    if (triggered.current || tripLoadStatus !== 'ready' || recoStatus !== 'ready') return;
    if (latest || awaiting) return;
    triggerContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, recoStatus, latest, awaiting]);

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

  function toggleEvidence() {
    const next = !evidenceOpen;
    setEvidenceOpen(next);
    updateUiState({ [FOCUSED_KEY]: focusedOption?.key ?? null, [EVIDENCE_OPEN_KEY]: next }).catch(() => {});
  }

  function handleToggleEvidence(option) {
    if (option.key !== focusedKey) {
      setFocusedKey(option.key);
      setEvidenceOpen(true);
      updateUiState({ [FOCUSED_KEY]: option.key, [EVIDENCE_OPEN_KEY]: true }).catch(() => {});
    } else {
      toggleEvidence();
    }
  }

  function planThis(option) {
    const isSelected = selectedOption && selectedOption.type === option.type && selectedOption.id === option.key;
    if (isSelected) {
      const destination = planReady(view?.plan) ? '/trip-preview' : '/scout-chat';
      navigate(withTripId(destination, view?.id));
      return;
    }
    doPlanThis(option);
  }

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

  function proceedFromGuideResponse(response) {
    const nextPlan = response.trip?.plan;
    const nextAwaiting = nextPlan?.awaiting;
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

  // Unified refine handler. If refinementValue has text when "More like this" is
  // clicked, sends immediately with that text as instructions. If empty, sets scope
  // and opens the refine box for the user to type a qualifier.
  async function handleMoreLikeThis(option) {
    const instructions = refinementValue.trim();
    if (instructions) {
      setRefinementValue('');
      setRefinementBusy(true);
      setPlanError(null);
      try {
        trackEvent('more_like_this_used', { with_qualifier: true });
        const response = await sendTripCommand('more_like_this', {
          refinement: {
            type: 'MORE_LIKE_THIS',
            reference: { type: option.type, id: option.key },
            instructions,
          },
        });
        applyCommandRound(response.recommendation);
        setFocusedKey(null);
        setEvidenceOpen(false);
        setRefinementScope(null);
        updateUiState({ [FOCUSED_KEY]: null, [EVIDENCE_OPEN_KEY]: false }).catch(() => {});
      } catch (commandError) {
        setPlanError(commandError.message || 'Something went wrong.');
      } finally {
        setRefinementBusy(false);
      }
    } else {
      setRefinementScope(option);
      setRefinementOpen(true);
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

  // Unified submit: if a scope is set, sends more_like_this; otherwise traveler_message.
  async function submitRefinement() {
    const value = refinementValue.trim();
    if (!value && !refinementScope) return;
    setRefinementValue('');
    setRefinementBusy(true);
    setPlanError(null);
    try {
      let response;
      if (refinementScope) {
        trackEvent('more_like_this_used', { with_qualifier: Boolean(value) });
        response = await sendTripCommand('more_like_this', {
          refinement: {
            type: 'MORE_LIKE_THIS',
            reference: { type: refinementScope.type, id: refinementScope.key },
            ...(value ? { instructions: value } : {}),
          },
        });
      } else {
        trackEvent('refinement_drawer_used', {});
        response = await sendTripCommand('traveler_message', { message: value });
      }
      applyCommandRound(response.recommendation);
      setFocusedKey(null);
      setEvidenceOpen(false);
      setRefinementOpen(false);
      setRefinementScope(null);
      updateUiState({ [FOCUSED_KEY]: null, [EVIDENCE_OPEN_KEY]: false }).catch(() => {});
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

  const recoSettled = recoStatus === 'ready' || recoStatus === 'error';
  const thinking = tripLoadStatus === 'loading' || !recoSettled || triggering
    || (tripLoadStatus === 'ready' && recoStatus === 'ready' && !latest && !awaiting && !triggerError);

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

  const selectedOptionName = selectedOption && outcome?.kind === 'options' && outcome.data
    ? outcome.data.options.find(o => o.type === selectedOption.type && o.key === selectedOption.id)?.name
    : null;

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
      <ScreenHeader
        eyebrow="Destination matcher"
        title={<>Let's find <em>your</em> place</>}
        lede={
          selectedOptionName
            ? `Not ${selectedOptionName} after all? Compare your options below and pick a different one.`
            : 'Matching against what you just told me — ranked by how well each fits.'
        }
      />
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
          <div className="agent-summary-message">
            <span className="agent-summary-badge">Guide</span>
            <p>{outcome.data.message}</p>
          </div>
          {planError && <div className="price-evidence state-unsafe" role="alert">{planError}</div>}

          <div className={`options-grid${refinementBusy ? ' options-busy' : ''}`}>
            {outcome.data.options.map(option => {
              const isSelected = selectedOption && selectedOption.type === option.type && selectedOption.id === option.key;
              const isFocused = option.key === (focusedOption?.key ?? null);
              return (
                <OptionDetailCard
                  key={option.key}
                  option={option}
                  criteria={outcome.data.criteria}
                  isSelected={isSelected}
                  isFocused={isFocused}
                  evidenceOpen={isFocused && evidenceOpen}
                  onFocus={() => focusOption(option.key)}
                  onToggleEvidence={() => handleToggleEvidence(option)}
                  onPlan={() => planThis(option)}
                  planning={planningId === option.key}
                  onMoreLikeThis={() => handleMoreLikeThis(option)}
                  moreLikeThisBusy={refinementBusy}
                />
              );
            })}
          </div>

          <div className="refinement-drawer">
            <button type="button" className="refinement-toggle" onClick={() => setRefinementOpen(open => !open)} aria-expanded={refinementOpen}>
              Not quite right? Tell us more <span>{refinementOpen ? '▴' : '▾'}</span>
            </button>
            {refinementOpen && (
              <div className="refinement-body">
                {refinementScope && (
                  <div className="refine-scope-pill">
                    ✨ Refining relative to <strong>{refinementScope.name}</strong>
                    <button type="button" className="refine-scope-clear" onClick={() => setRefinementScope(null)} aria-label="Clear scope">×</button>
                  </div>
                )}
                <textarea
                  className="refinement-input"
                  aria-label="Tell us more"
                  placeholder={refinementScope
                    ? `e.g. cheaper, closer, slower… (optional)`
                    : `e.g. I'd rather avoid long overnight trains, or I want somewhere quieter…`}
                  value={refinementValue}
                  onChange={event => setRefinementValue(event.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={submitRefinement} disabled={refinementBusy || (!refinementValue.trim() && !refinementScope)}>Send</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
