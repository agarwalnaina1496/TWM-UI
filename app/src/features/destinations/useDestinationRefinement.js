import { useCallback, useState } from 'react';
import { trackEvent, trackFailure } from '../../lib/analytics.js';

// TWM-234: everything that narrows the current options down -- the initial
// "continue" trigger, free-text clarification, and the "not quite right?"
// refinement drawer -- split out of useDestinations so neither file
// trips the per-function complexity cap on its own. A per-option "more like
// this" scoped refinement used to exist alongside this general drawer, but
// two separate refine entry points read as confusing UX; dropped down to
// this one general drawer only.
export function useDestinationRefinement({ sendTripCommand, applyCommandRound, resetFocus, triggeredRef, setActionError }) {
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const [clarifyInput, setClarifyInput] = useState('');
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [refinementValue, setRefinementValue] = useState('');
  const [refinementBusy, setRefinementBusy] = useState(false);

  function triggerContinue() {
    triggeredRef.current = true;
    setTriggering(true);
    setTriggerError(null);
    return sendTripCommand('continue')
      .then(response => applyCommandRound(response.recommendation))
      .catch(commandError => { trackFailure('discovery', commandError); setTriggerError(commandError.message || 'Something went wrong.'); })
      .finally(() => setTriggering(false));
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
    setActionError(null);
    try {
      trackEvent('refinement_drawer_used', {});
      const response = await sendTripCommand('traveler_message', { message: value });
      applyCommandRound(response.recommendation);
      setRefinementOpen(false);
      resetFocus();
    } catch (commandError) {
      setActionError(commandError.message || 'Something went wrong.');
    } finally {
      setRefinementBusy(false);
    }
  }

  const tapFailureChip = useCallback((suggestion, status) => {
    trackEvent('terminal_failure_chip_tapped', { status });
    setClarifyInput(suggestion);
  }, []);

  return {
    triggering, triggerError, triggerContinue,
    clarifyInput, setClarifyInput, submitClarification, tapFailureChip,
    refinementOpen, setRefinementOpen, refinementValue, setRefinementValue, refinementBusy,
    submitRefinement,
  };
}
