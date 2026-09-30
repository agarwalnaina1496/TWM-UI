import { useEffect, useRef } from 'react';
import { trackEvent } from '../lib/analytics.js';

// TWM-234: split out of useDestinationsMatching purely to keep that file's
// complexity under the cap -- the "are we still waiting on a result" flag
// plus its one-time analytics event.
export function useThinkingState({ enabled, tripLoadStatus, recoStatus, latest, awaiting, triggering, triggerError }) {
  const recoSettled = recoStatus === 'ready' || recoStatus === 'error';
  const thinking = enabled && (tripLoadStatus === 'loading' || !recoSettled || triggering
    || (tripLoadStatus === 'ready' && recoStatus === 'ready' && !latest && !awaiting && !triggerError));

  const trackedTransitionShown = useRef(false);
  useEffect(() => {
    if (!thinking || trackedTransitionShown.current) return;
    trackedTransitionShown.current = true;
    trackEvent('honest_transition_shown', { trigger: 'initial_discover' });
  }, [thinking]);

  return thinking;
}
