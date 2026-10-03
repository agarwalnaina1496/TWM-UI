import { useRef, useState } from 'react';
import { useTrip } from '../../context/TripContext.jsx';
import { planReady } from '../../hooks/useGuidePlanning.js';
import { trackEvent } from '../../lib/analytics.js';
import { isFixedFieldGap } from '../../lib/planChat.js';
import { contextRecapPills } from '../../lib/tripLifecycle.js';

// Everything the "Your pick" section needs, owned by the section itself:
// the chosen destination, starting to plan it (Guide's first turn, with the
// one-missing-field checkpoint), and reconsidering it. Choosing a
// destination and starting to plan it are two separate traveler actions --
// "Plan this trip" is what starts planning, and "Compare other destinations"
// undoes the match (stage -> recommended) without re-invoking Meridian, since
// the already-fetched recommendation round is still good to show.
//
// `onPlanStarted` is optional: a place that needs to navigate once planning
// has started (the standalone Destinations screen) passes it; one that
// swaps its own content by stage (Dashboard Overview) simply doesn't.
export function useYourPick({ onPlanStarted } = {}) {
  const { commandSnapshot: view, sendTripCommand } = useTrip();
  const selectedOption = view?.lifecycle?.selected_option ?? null;

  const [planning, setPlanning] = useState(false);
  const [unselecting, setUnselecting] = useState(false);
  const [error, setError] = useState(null);
  const [checkpointAwaiting, setCheckpointAwaiting] = useState(null);
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [checkpointInput, setCheckpointInput] = useState('');
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointError, setCheckpointError] = useState(null);
  const trackedCheckpointFields = useRef(new Set());
  const checkpointWasShown = useRef(false);

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
    onPlanStarted?.({
      tripId: response.trip?.id ?? view?.id,
      planReady: planReady(nextPlan),
      message: response.message,
    });
  }

  async function planThis() {
    if (!selectedOption) return;
    // Reached from a screen that outlived the match (a bookmarked
    // /destinations for a trip that is already being planned): planning is
    // underway, so there is nothing to start -- just carry on to wherever it
    // is happening.
    const stage = view?.lifecycle?.stage;
    if (stage && stage !== 'matched') {
      onPlanStarted?.({ tripId: view.id, planReady: planReady(view.plan), message: undefined });
      return;
    }
    setError(null);
    setPlanning(true);
    try {
      trackEvent('planning_started', { selection_source: 'plan_this_trip' });
      const response = await sendTripCommand('start_planning');
      proceedFromGuideResponse(response);
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setPlanning(false);
    }
  }

  async function compareOtherDestinations() {
    setError(null);
    setUnselecting(true);
    try {
      await sendTripCommand('unselect_destination');
      trackEvent('destination_unselected', {});
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setUnselecting(false);
    }
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
    selectedOptionName: selectedOption?.name ?? null,
    pills: contextRecapPills(view),
    planning, planThis, unselecting, compareOtherDestinations, error,
    checkpointAwaiting, checkpointMessage, checkpointInput, checkpointBusy, checkpointError,
    setCheckpointInput, submitCheckpoint,
  };
}
