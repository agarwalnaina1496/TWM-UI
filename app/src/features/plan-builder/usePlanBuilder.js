import { useEffect, useRef, useState } from 'react';
import { useTrip } from '../../context/TripContext.jsx';
import { planBuilderSummary } from './planBuilderSummary.js';
import { trackEvent, trackFailure } from '../../lib/analytics.js';
import { isTripEmpty } from '../../lib/tripLifecycle.js';
import { withTripId } from '../../lib/tripUrl.js';
import { useTripFromUrl } from '../../hooks/useTripFromUrl.js';
import { usePlanReopen } from './usePlanReopen.js';

// Everything the Plan Builder section needs, owned by the section itself.
// `navigateTo(path, opts)` is optional: only the standalone screen passes
// it and gets real navigation. A place that swaps its own content by stage
// (Dashboard Overview) leaves it out -- its primaryCta already recomputes
// from the refetched TripView after each command (stage flips to matching
// -> chat, plan freezes -> off this section entirely), so an explicit route
// change would just fight that reactive switch. The boot effect below only
// runs while the section is mounted, so Overview never fires
// `start_planning` against a trip it is showing something else for.
export function usePlanBuilder({ navigateTo, guideMessage } = {}) {
  const { commandSnapshot, sendTripCommand, tripLoadStatus } = useTrip();
  const urlTripId = useTripFromUrl();

  const navigates = Boolean(navigateTo);
  function go(path, opts) {
    navigateTo?.(path, opts);
  }

  const view = commandSnapshot;
  const plan = view?.plan;
  const frozenPlan = plan?.frozen;
  const awaiting = plan?.awaiting;
  const places = plan?.places || [];
  const dayPlan = plan?.day_plan || [];
  const planReady = dayPlan.length > 0;

  const [bootStatus, setBootStatus] = useState('idle'); // idle | booting | ready | error
  const [bootError, setBootError] = useState(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(guideMessage || '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [freeText, setFreeText] = useState('');
  const bootStarted = useRef(false);
  const trackedPlanBuilderView = useRef(false);
  const planningEntry = view?.lifecycle?.selected_option ? 'discovered_destination' : 'known_destination';

  // Already frozen (e.g. the traveler navigated back after approving) — Guide
  // never reruns, so skip straight to the dashboard.
  useEffect(() => {
    if (!frozenPlan) return;
    go(withTripId('/dashboard', commandSnapshot?.id), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenPlan]);

  // A direct/deep-link/stale-tab navigation to an empty trip has nothing
  // real to render here — redirect home instead of booting Guide against an
  // orphan trip. Gated on a URL tripId so a fresh not-yet-created trip is
  // unaffected. Standalone-page-only: an embedded panel only ever renders
  // once Overview's own view already resolved a real trip.
  useEffect(() => {
    if (!navigates || !urlTripId || tripLoadStatus !== 'ready' || !isTripEmpty(view)) return;
    go('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigates, urlTripId, tripLoadStatus, view]);

  // Bootstraps the real Guide session for the discover path (the
  // known-destination path already starts Guide from JourneyEntry's chat).
  useEffect(() => {
    if (tripLoadStatus !== 'ready') return;
    if (frozenPlan || bootStarted.current || (urlTripId && isTripEmpty(view))) return;
    if (plan && dayPlan.length > 0) {
      setBootStatus('ready');
      return;
    }
    if (plan && (places.length || awaiting)) {
      // Guide already owns this trip but hasn't produced a day_plan yet —
      // that gating conversation lives on ScoutChat/the embedded chat panel.
      go(withTripId('/scout-chat', commandSnapshot?.id), { replace: true });
      return;
    }
    bootStarted.current = true;
    setBootStatus('booting');
    (async () => {
      try {
        const response = await sendTripCommand('start_planning');
        const nextPlan = response.trip?.plan;
        if (!nextPlan?.day_plan?.length) {
          go(withTripId('/scout-chat', response.trip?.id ?? commandSnapshot?.id), { replace: true });
          return;
        }
        if (response.message) setMessage(response.message);
        setBootStatus('ready');
      } catch (error) {
        trackFailure('plan_builder', error);
        setBootStatus('error');
        setBootError(error.message || 'Could not start planning.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus, frozenPlan]);

  useEffect(() => {
    if (trackedPlanBuilderView.current || bootStatus !== 'ready' || !planReady) return;
    trackedPlanBuilderView.current = true;
    trackEvent('plan_builder_viewed', { planning_entry: planningEntry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootStatus, planReady]);

  async function removePlace(place, dayNumber) {
    setPending(true);
    setMessage('');
    try {
      const response = await sendTripCommand('remove_place', { placeName: place, dayNumber });
      setMessage(response.message || '');
      trackEvent('plan_builder_edit', { edit_type: 'remove', planning_entry: planningEntry });
    } catch (error) {
      setMessage(error.message || 'That change could not be applied. The plan shown is now the latest saved version.');
    } finally {
      setPending(false);
    }
  }

  async function sendChat(text) {
    setPending(true);
    setMessage('');
    try {
      const response = await sendTripCommand('traveler_message', { message: text });
      setMessage(response.message || '');
      trackEvent('plan_builder_edit', { edit_type: 'chat', planning_entry: planningEntry });
    } catch (error) {
      setMessage(error.message || 'That change could not be applied. The plan shown is now the latest saved version.');
    } finally {
      setPending(false);
    }
  }

  function generate() {
    setPending(true);
    setMessage('');
    trackEvent('itinerary_generation_started', { generation_trigger: 'plan_builder' });
    sendTripCommand('approve_plan')
      .catch(error => { trackFailure('itinerary_generation', error); setMessage(error.message || 'Could not generate the detailed itinerary.'); })
      .finally(() => setPending(false));
    // Freezing navigates via the frozenPlan effect above once commandSnapshot updates.
  }

  const reopen = usePlanReopen({ sendTripCommand, go, setMessage, commandSnapshotId: commandSnapshot?.id });

  return {
    view, plan, bootStatus, bootError, pending, message, drawerOpen, setDrawerOpen,
    freeText, setFreeText,
    summary: plan ? planBuilderSummary(view) : null, dayPlan,
    removePlace, sendChat, generate,
    reversing: reopen.reversing, reversalError: reopen.reversalError, reopenChoicePending: reopen.reopenChoicePending,
    reopenDestinationDiscovery: reopen.reopenDestinationDiscovery,
    resolveReopenChoice: command => reopen.resolveReopenChoice(command, { setPending }),
  };
}
