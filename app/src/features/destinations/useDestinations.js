import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTrip } from '../../context/TripContext.jsx';
import { useRecommendationsQuery } from '../../hooks/tripQueries.js';
import { useDestinationRefinement } from './useDestinationRefinement.js';
import { useDestinationFocus } from './useDestinationFocus.js';
import { useOutcomeTracking } from './useOutcomeTracking.js';
import { useThinkingState } from './useThinkingState.js';
import { safeMatcherOutcomeViewModel } from '../../lib/recommendationViewModel.js';
import { contextRecapPills } from '../../lib/tripLifecycle.js';
import { trackEvent } from '../../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../../lib/uiStateKeys.js';

const FOCUSED_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'focusedKey');
const EVIDENCE_OPEN_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'evidenceOpen');

function recommendationsQueryStatus(tripId, query) {
  if (!tripId) return 'ready';
  if (query.isError) return 'error';
  return query.data !== undefined ? 'ready' : 'loading';
}

// Everything the Destinations section needs, owned by the section itself:
// the recommendations query, the outcome view model, choosing a destination,
// and the refinement/focus helpers it composes. The section only runs while
// it is mounted, so there is no "enabled" switch -- not rendering it is what
// keeps the query and the auto-continue effect from firing. What happens
// after a destination is chosen is YourPickSection's job, not this one's.
export function useDestinations() {
  const { commandSnapshot: view, sendTripCommand, tripLoadStatus, tripLoadError, retryTripLoad, uiState, updateUiState } = useTrip();

  const triggered = useRef(false);
  const [actionError, setActionError] = useState(null);
  const [choosingId, setChoosingId] = useState(null);

  const tripId = view?.id;
  const awaiting = view?.matcher?.awaiting;
  const lastMeridianMessage = view?.matcher?.last_message;
  const selectedOption = view?.lifecycle?.selected_option ?? null;

  const recommendationsQuery = useRecommendationsQuery(tripId);
  const latest = recommendationsQuery.data ?? null;
  const recoStatus = recommendationsQueryStatus(tripId, recommendationsQuery);
  const recoError = recommendationsQuery.error?.message || 'Could not load recommendations.';
  const refreshLatest = recommendationsQuery.refetch;

  const applyCommandRound = useCallback(round => {
    if (round?.options?.length) {
      trackEvent('recommendations_generated', { recommendation_count: round.options.length });
    }
  }, []);

  const focus = useDestinationFocus({
    enabled: true, tripLoadStatus, uiState, updateUiState,
    focusedKeyStateKey: FOCUSED_KEY,
    evidenceOpenStateKey: EVIDENCE_OPEN_KEY,
  });
  const { focusedKey, setFocusedKey, evidenceOpen, setEvidenceOpen } = focus;

  const resetFocus = useCallback(() => {
    setFocusedKey(null);
    setEvidenceOpen(false);
    updateUiState({ [FOCUSED_KEY]: null, [EVIDENCE_OPEN_KEY]: false }).catch(() => {});
  }, [setFocusedKey, setEvidenceOpen, updateUiState]);

  const refinement = useDestinationRefinement({ sendTripCommand, applyCommandRound, resetFocus, triggeredRef: triggered, setActionError });

  useEffect(() => {
    if (triggered.current || tripLoadStatus !== 'ready' || recoStatus !== 'ready') return;
    // A chosen destination means matching is already done -- never kick off
    // a fresh continue here, even if this mount's own recommendations cache
    // looks momentarily empty (e.g. a reload racing the refetch). Backend's
    // `continue` now safely rejects this case rather than reopening
    // matching, but there's no reason to even attempt it: `selectedOption`
    // is the authoritative "nothing left to continue" signal, independent
    // of whether this specific query has resolved yet.
    if (latest || awaiting || selectedOption) return;
    refinement.triggerContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, recoStatus, latest, awaiting, selectedOption]);

  const outcome = useMemo(
    () => (latest ? safeMatcherOutcomeViewModel(latest) : null),
    [latest]
  );

  useOutcomeTracking({ outcome, latestVersion: latest?.version, focusedKey, setFocusedKey });

  const pills = contextRecapPills(view);
  const thinking = useThinkingState({
    enabled: true, tripLoadStatus, recoStatus, latest, awaiting,
    triggering: refinement.triggering, triggerError: refinement.triggerError,
    selectedOption,
  });

  const showTripLoadError = tripLoadStatus === 'error';
  const showRecoError = !showTripLoadError && recoStatus === 'error';
  const focusedOption = outcome?.kind === 'options' && outcome.data
    ? outcome.data.options.find(o => o.key === focusedKey) ?? outcome.data.options[0]
    : null;

  async function chooseDestination(option) {
    setActionError(null);
    setChoosingId(option.key);
    try {
      await sendTripCommand('select_destination', { optionId: option.key });
      trackEvent('destination_selected', { selection_source: 'choose' });
    } catch (commandError) {
      setActionError(commandError.message || 'Something went wrong.');
    } finally {
      setChoosingId(null);
    }
  }

  return {
    pills, showTripLoadError, showRecoError, recoError, thinking,
    awaiting, latest, lastMeridianMessage, outcome, focusedOption, evidenceOpen,
    actionError, tripLoadError, retryTripLoad, refreshLatest,
    focusOption: focus.focusOption, handleToggleEvidence: focus.handleToggleEvidence,
    chooseDestination, choosingId,
    ...refinement,
  };
}
