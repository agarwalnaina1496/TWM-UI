import { useState } from 'react';
import { trackEvent } from '../../lib/analytics.js';
import { withTripId } from '../../lib/tripUrl.js';
import { REOPEN_DESTINATION_MESSAGE } from './constants.js';

// TWM-234: "reconsider the destination" from Plan Builder -- split out of
// usePlanBuilder purely to keep that file's length under the cap.
export function usePlanReopen({ sendTripCommand, go, setMessage, commandSnapshotId }) {
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState(null);
  const [reopenChoicePending, setReopenChoicePending] = useState(false);

  async function reopenDestinationDiscovery() {
    setReversing(true);
    setReversalError(null);
    trackEvent('reopen_destination_discovery_triggered', { source: 'plan_builder_reversal' });
    try {
      const response = await sendTripCommand('traveler_message', { message: REOPEN_DESTINATION_MESSAGE });
      const nextView = response.trip;
      const nextAwaiting = nextView?.plan?.awaiting;
      if (nextAwaiting === 'destination_reopen_choice') {
        setReopenChoicePending(true);
        setMessage(response.message || '');
        return;
      }
      // No prior recommendations existed — the reversal already happened in
      // this same command. Navigate off the stage actually returned rather
      // than assuming /destinations for every reversal (matching -> /scout-chat).
      if (nextView?.lifecycle?.stage === 'matching') {
        go(withTripId('/scout-chat', response.trip?.id ?? commandSnapshotId));
        return;
      }
      setMessage(response.message || '');
    } catch (error) {
      setReversalError(error.message || 'Could not reconsider the destination.');
    } finally {
      setReversing(false);
    }
  }

  async function resolveReopenChoice(command, { setPending }) {
    setReversalError(null);
    if (command === 'reopen_destination_fresh') setReversing(true);
    else setPending(true);
    try {
      const response = await sendTripCommand(command);
      const nextView = response.trip;
      const destination = nextView?.lifecycle?.stage === 'recommended' ? '/destinations' : '/scout-chat';
      go(withTripId(destination, response.trip?.id ?? commandSnapshotId));
    } catch (error) {
      setReversalError(error.message || 'Could not reconsider the destination.');
    } finally {
      setReversing(false);
      setPending(false);
    }
  }

  return { reversing, reversalError, reopenChoicePending, reopenDestinationDiscovery, resolveReopenChoice };
}
