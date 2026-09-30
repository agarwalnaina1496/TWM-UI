import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../lib/analytics.js';
import { isFixedFieldGap } from '../lib/planChat.js';
import { planReady } from './useGuidePlanning.js';
import { withTripId } from '../lib/tripUrl.js';

// TWM-234: the "select a destination -> start planning -> possibly hit a
// checkpoint question" flow, split out of useDestinationsMatching so neither
// file trips the per-function complexity cap on its own.
export function useDestinationPlanning({ view, sendTripCommand, setPlanError }) {
  const navigate = useNavigate();
  const [planningId, setPlanningId] = useState(null);
  const [checkpointAwaiting, setCheckpointAwaiting] = useState(null);
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [checkpointInput, setCheckpointInput] = useState('');
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointError, setCheckpointError] = useState(null);
  const trackedCheckpointFields = useRef(new Set());
  const checkpointWasShown = useRef(false);

  const selectedOption = view?.lifecycle?.selected_option ?? null;

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
    const nextTripId = response.trip?.id ?? view?.id;
    if (planReady(nextPlan)) {
      navigate(withTripId('/trip-preview', nextTripId), { state: { guideMessage: response.message } });
      return;
    }
    navigate(withTripId('/scout-chat', nextTripId));
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

  function planThis(option) {
    const isSelected = selectedOption && selectedOption.type === option.type && selectedOption.id === option.key;
    if (isSelected) {
      const destination = planReady(view?.plan) ? '/trip-preview' : '/scout-chat';
      navigate(withTripId(destination, view?.id));
      return;
    }
    doPlanThis(option);
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

  return {
    selectedOption, planningId, planThis,
    checkpointAwaiting, checkpointMessage, checkpointInput, checkpointBusy, checkpointError,
    setCheckpointInput, submitCheckpoint,
  };
}
