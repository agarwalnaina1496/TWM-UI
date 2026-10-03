import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { trackEvent } from '../lib/analytics.js';
import { withTripId } from '../lib/tripUrl.js';
import { ROUTES } from '../constants/routes.js';
import '../styles/dashboard-home.css';

// TWM-234: a matched trip's two next steps, runnable straight from its My
// Trips card -- the same two commands the Dashboard's matched panel sends
// ("Plan this trip" -> start_planning, "Want a different destination" ->
// unselect_destination, back to the recommendation round). Each is an
// explicit traveler click, and the Backend rejects a replay (stale card,
// second tab) because both only run from `matched`, so a double-click or a
// race fails closed with a message instead of corrupting the trip.
const ACTIONS = {
  plan: {
    command: 'start_planning',
    label: 'Plan this trip →',
    busyLabel: 'Starting…',
    event: ['planning_started', { selection_source: 'my_trips_card' }],
    failure: "Couldn't start planning. Try again.",
  },
  compare: {
    command: 'unselect_destination',
    label: 'Want a different destination?',
    busyLabel: 'Opening…',
    event: ['destination_unselected', { source: 'my_trips_card' }],
    failure: "Couldn't reopen your destinations. Try again.",
  },
};

export default function MatchedTripActions({ tripId }) {
  const navigate = useNavigate();
  const { prefetchTrip, sendTripCommand } = useTrip();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function run(name) {
    if (busy) return;
    const action = ACTIONS[name];
    setBusy(name);
    setError(null);
    try {
      const opened = await prefetchTrip(tripId);
      if (!opened.ok) {
        setError('This trip is no longer available.');
        return;
      }
      trackEvent(...action.event);
      await sendTripCommand(action.command, { tripId });
      navigate(withTripId(ROUTES.dashboard, tripId));
    } catch (commandError) {
      setError(commandError.message || action.failure);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="trip-card-actions-wrap">
      <div className="trip-card-actions">
        <button type="button" className="btn btn-primary" disabled={busy != null} onClick={() => run('plan')}>
          {busy === 'plan' ? ACTIONS.plan.busyLabel : ACTIONS.plan.label}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy != null} onClick={() => run('compare')}>
          {busy === 'compare' ? ACTIONS.compare.busyLabel : ACTIONS.compare.label}
        </button>
      </div>
      {error && <p className="trip-card-action-error" role="alert">{error}</p>}
    </div>
  );
}
