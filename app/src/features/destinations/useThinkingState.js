import { useEffect, useRef } from 'react';
import { trackEvent } from '../../lib/analytics.js';

// TWM-234: split out of useDestinations purely to keep that file's
// complexity under the cap -- the "are we still waiting on a result" flag
// plus its one-time analytics event.
export function useThinkingState({ enabled, tripLoadStatus, recoStatus, latest, awaiting, triggering, triggerError, selectedOption }) {
  const recoSettled = recoStatus === 'ready' || recoStatus === 'error';
  // A chosen destination means the first match already happened -- there is
  // no legitimate "still waiting for the first result" state once matched,
  // only a genuine data problem (missing recommendation for an
  // already-matched trip). That case belongs to the recoverable reco-error
  // path (useDestinations), never an unending "thinking" spinner.
  const thinking = enabled && !selectedOption && (tripLoadStatus === 'loading' || !recoSettled || triggering
    || (tripLoadStatus === 'ready' && recoStatus === 'ready' && !latest && !awaiting && !triggerError));

  const trackedTransitionShown = useRef(false);
  useEffect(() => {
    if (!thinking || trackedTransitionShown.current) return;
    trackedTransitionShown.current = true;
    trackEvent('honest_transition_shown', { trigger: 'initial_discover' });
  }, [thinking]);

  return thinking;
}
