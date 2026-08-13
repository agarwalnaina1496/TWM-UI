import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { resolveLandingRoute } from '../lib/tripLifecycle.js';
import { trackEvent } from '../lib/analytics.js';
import GetStarted from './GetStarted.jsx';

// Adaptive `/` resolver (TWM-108). Deep links bypass this entirely — it only
// owns the root route. Renders GetStarted inline (not a redirect) while
// trips are still loading/unavailable, or once resolved to zero/fresh trips.
export default function Landing() {
  const { trips, currentTripId, tripLoadStatus } = useTrip();
  const trackedEntry = useRef(false);

  if (tripLoadStatus !== 'ready') return <GetStarted />;

  const to = resolveLandingRoute({ trips, currentTripId });
  if (to && to !== '/') return <Navigate to={to} replace />;
  return <ProductEntry trackedEntry={trackedEntry} />;
}

// product_entry (TWM-149) fires only once the resolver has genuinely
// decided this is a fresh/no-context visitor landing on GetStarted — not
// during the transient loading placeholder, which would otherwise
// over-count returning users who get redirected straight to an existing trip.
function ProductEntry({ trackedEntry }) {
  useEffect(() => {
    if (trackedEntry.current) return;
    trackedEntry.current = true;
    trackEvent('product_entry', { entry_point: 'homepage' });
  }, [trackedEntry]);
  return <GetStarted />;
}
