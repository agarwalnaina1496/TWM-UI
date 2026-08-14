import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { hasMeaningfulTrip } from '../lib/tripLifecycle.js';
import { trackEvent } from '../lib/analytics.js';
import GetStarted from './GetStarted.jsx';
import MyTrips from './MyTrips.jsx';

// Adaptive `/` resolver (TWM-108, reworked for Dashboard-as-home in
// TWM-163). Deep links bypass this entirely — it only owns the root route.
// Renders GetStarted inline (not a redirect) while trips are still
// loading/unavailable, or once resolved to zero meaningful trips. Otherwise
// renders the Dashboard-home (MyTrips) surface directly — no auto-navigating
// into a resume flow or the per-trip Dashboard; that only happens from an
// explicit trip-card click. The brand link (Header.jsx) navigates here with
// `state.skipResume` so it always lands on GetStarted instead of the home.
export default function Landing() {
  const { trips, tripLoadStatus } = useTrip();
  const trackedEntry = useRef(false);
  const location = useLocation();

  if (tripLoadStatus !== 'ready') return <GetStarted />;
  if (location.state?.skipResume) return <ProductEntry trackedEntry={trackedEntry} />;
  if (hasMeaningfulTrip(trips)) return <MyTrips />;
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
