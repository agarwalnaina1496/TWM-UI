import { useLocation } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import GetStarted from './GetStarted.jsx';
import MyTrips from './MyTrips.jsx';

// Adaptive `/` resolver (TWM-108, reworked for Dashboard-as-home in
// TWM-163). Deep links bypass this entirely — it only owns the root route.
// `/` always renders the Dashboard-home (MyTrips) surface once trips have
// loaded — including for a traveler with zero trips, who sees MyTrips' own
// empty state (not GetStarted). GetStarted/JourneyEntry is reached only via
// an explicit "New Trip" action (`state.skipResume`, set by the brand link
// in Header.jsx and MyTrips' own New Trip button), never as the default
// landing experience. No auto-navigating into a resume flow or the per-trip
// Dashboard from here — that only happens from an explicit trip-card click.
export default function Landing() {
  const { tripLoadStatus } = useTrip();
  const location = useLocation();

  if (tripLoadStatus !== 'ready') return <GetStarted />;
  if (location.state?.skipResume) return <GetStarted />;
  return <MyTrips />;
}
