import { useCallback, useState } from 'react';
import { trackEvent, trackFailure } from '../lib/analytics.js';

// TWM-234: everything that narrows the current options down -- the initial
// "continue" trigger, free-text clarification, and "more like this"
// refinement (scoped or drawer) -- split out of useDestinationsMatching so
// neither file trips the per-function complexity cap on its own.
export function useDestinationRefinement({ sendTripCommand, applyCommandRound, resetFocus, triggeredRef, setPlanError }) {
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const [clarifyInput, setClarifyInput] = useState('');
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [refinementValue, setRefinementValue] = useState('');
  const [refinementScope, setRefinementScope] = useState(null);
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

  // Unified refine handler. If refinementValue has text when "More like this" is
  // clicked, sends immediately with that text as instructions. If empty, sets scope
  // and opens the refine box for the user to type a qualifier.
  async function handleMoreLikeThis(option) {
    const instructions = refinementValue.trim();
    if (!instructions) {
      setRefinementScope(option);
      setRefinementOpen(true);
      return;
    }
    setRefinementValue('');
    setRefinementBusy(true);
    setPlanError(null);
    try {
      trackEvent('more_like_this_used', { with_qualifier: true });
      const response = await sendTripCommand('more_like_this', {
        refinement: { type: 'MORE_LIKE_THIS', reference: { type: option.type, id: option.key }, instructions },
      });
      applyCommandRound(response.recommendation);
      setRefinementScope(null);
      resetFocus();
    } catch (commandError) {
      setPlanError(commandError.message || 'Something went wrong.');
    } finally {
      setRefinementBusy(false);
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
      const response = await sendRefinementCommand({ sendTripCommand, refinementScope, value });
      applyCommandRound(response.recommendation);
      setRefinementOpen(false);
      setRefinementScope(null);
      resetFocus();
    } catch (commandError) {
      setPlanError(commandError.message || 'Something went wrong.');
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
    refinementOpen, setRefinementOpen, refinementValue, setRefinementValue,
    refinementScope, setRefinementScope, refinementBusy,
    handleMoreLikeThis, submitRefinement,
  };
}

async function sendRefinementCommand({ sendTripCommand, refinementScope, value }) {
  if (refinementScope) {
    trackEvent('more_like_this_used', { with_qualifier: Boolean(value) });
    return sendTripCommand('more_like_this', {
      refinement: {
        type: 'MORE_LIKE_THIS',
        reference: { type: refinementScope.type, id: refinementScope.key },
        ...(value ? { instructions: value } : {}),
      },
    });
  }
  trackEvent('refinement_drawer_used', {});
  return sendTripCommand('traveler_message', { message: value });
}
