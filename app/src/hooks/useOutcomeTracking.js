import { useEffect, useRef } from 'react';
import { trackEvent } from '../lib/analytics.js';

// TWM-234: one-time analytics/default-focus side effects that fire off the
// computed outcome -- split out of useDestinationsMatching purely to keep
// that file's complexity under the cap.
export function useOutcomeTracking({ outcome, latestVersion, focusedKey, setFocusedKey }) {
  const viewedVersion = useRef(null);
  useEffect(() => {
    if (outcome?.kind !== 'options' || !outcome.data || !latestVersion) return;
    if (viewedVersion.current === latestVersion) return;
    viewedVersion.current = latestVersion;
    trackEvent('recommendations_viewed', { recommendation_count: outcome.data.options.length });
  }, [outcome, latestVersion]);

  const trackedFailureStatus = useRef(null);
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
}
