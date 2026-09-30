import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTrip } from '../context/TripContext.jsx';
import { useRecommendationsQuery } from './tripQueries.js';
import { useDestinationPlanning } from './useDestinationPlanning.js';
import { useDestinationRefinement } from './useDestinationRefinement.js';
import { useDestinationFocus } from './useDestinationFocus.js';
import { useOutcomeTracking } from './useOutcomeTracking.js';
import { useThinkingState } from './useThinkingState.js';
import { safeMatcherOutcomeViewModel } from '../lib/recommendationViewModel.js';
import { contextRecapPills } from '../lib/tripLifecycle.js';
import { trackEvent } from '../lib/analytics.js';
import { UI_STATE_SCREEN, uiStateKey } from '../lib/uiStateKeys.js';

const FOCUSED_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'focusedKey');
const EVIDENCE_OPEN_KEY = uiStateKey(UI_STATE_SCREEN.DESTINATIONS, 'evidenceOpen');

function recommendationsQueryStatus(tripId, query) {
  if (!tripId) return 'ready';
  if (query.isError) return 'error';
  return query.data !== undefined ? 'ready' : 'loading';
}

// TWM-234: split into useDestinationPlanning (select -> plan -> checkpoint),
// useDestinationRefinement (continue/clarify/more-like-this), useDestinationFocus
// (which card is focused/expanded), and useThinkingState (the loading flag)
// so this file stays under the per-function complexity cap; it owns just
// the recommendations query and the outcome view model, then composes the
// rest. Extracted from Destinations.jsx (the page) so the same matching/
// comparison state can drive either the standalone Destinations screen or
// an embedded panel in Dashboard Overview -- one source of truth for the
// behavior, two places it can render. `enabled: false` (Overview, when
// Destinations isn't the current step) keeps the query and auto-continue
// effect from firing at all.
export function useDestinationsMatching({ enabled = true } = {}) {
  const { commandSnapshot: view, sendTripCommand, tripLoadStatus, tripLoadError, retryTripLoad, uiState, updateUiState } = useTrip();

  const triggered = useRef(false);
  const [planError, setPlanError] = useState(null);

  const tripId = enabled ? view?.id : undefined;
  const awaiting = view?.matcher?.awaiting;
  const lastMeridianMessage = view?.matcher?.last_message;

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
    enabled, tripLoadStatus, uiState, updateUiState,
    focusedKeyStateKey: FOCUSED_KEY,
    evidenceOpenStateKey: EVIDENCE_OPEN_KEY,
  });
  const { focusedKey, setFocusedKey, evidenceOpen, setEvidenceOpen } = focus;

  const resetFocus = useCallback(() => {
    setFocusedKey(null);
    setEvidenceOpen(false);
    updateUiState({ [FOCUSED_KEY]: null, [EVIDENCE_OPEN_KEY]: false }).catch(() => {});
  }, [setFocusedKey, setEvidenceOpen, updateUiState]);

  const planning = useDestinationPlanning({ view, sendTripCommand, setPlanError });
  const refinement = useDestinationRefinement({ sendTripCommand, applyCommandRound, resetFocus, triggeredRef: triggered, setPlanError });

  useEffect(() => {
    if (!enabled || triggered.current || tripLoadStatus !== 'ready' || recoStatus !== 'ready') return;
    if (latest || awaiting) return;
    refinement.triggerContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tripLoadStatus, recoStatus, latest, awaiting]);

  const outcome = useMemo(
    () => (latest ? safeMatcherOutcomeViewModel(latest) : null),
    [latest]
  );

  useOutcomeTracking({ outcome, latestVersion: latest?.version, focusedKey, setFocusedKey });

  const pills = contextRecapPills(view);
  const thinking = useThinkingState({ enabled, tripLoadStatus, recoStatus, latest, awaiting, triggering: refinement.triggering, triggerError: refinement.triggerError });

  const showTripLoadError = tripLoadStatus === 'error';
  const showRecoError = !showTripLoadError && recoStatus === 'error';
  const focusedOption = outcome?.kind === 'options' && outcome.data
    ? outcome.data.options.find(o => o.key === focusedKey) ?? outcome.data.options[0]
    : null;

  const selectedOptionName = planning.selectedOption && outcome?.kind === 'options' && outcome.data
    ? outcome.data.options.find(o => o.type === planning.selectedOption.type && o.key === planning.selectedOption.id)?.name
    : null;

  return {
    pills, selectedOptionName, showTripLoadError, showRecoError, recoError, thinking,
    awaiting, latest, lastMeridianMessage, outcome, focusedOption, evidenceOpen,
    planError, tripLoadError, retryTripLoad, refreshLatest,
    focusOption: focus.focusOption, handleToggleEvidence: focus.handleToggleEvidence,
    ...planning,
    ...refinement,
  };
}
