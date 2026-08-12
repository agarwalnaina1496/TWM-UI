import { Navigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { resolveLandingRoute } from '../lib/tripLifecycle.js';
import GetStarted from './GetStarted.jsx';

// Adaptive `/` resolver (TWM-108). Deep links bypass this entirely — it only
// owns the root route. Renders GetStarted inline (not a redirect) while
// trips are still loading/unavailable, or once resolved to zero/fresh trips.
export default function Landing() {
  const { trips, currentTripId, tripLoadStatus } = useTrip();

  if (tripLoadStatus !== 'ready') return <GetStarted />;

  const to = resolveLandingRoute({ trips, currentTripId });
  if (to && to !== '/') return <Navigate to={to} replace />;
  return <GetStarted />;
}
