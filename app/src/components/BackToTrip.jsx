import { Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { withTripId } from '../lib/tripUrl.js';
import '../styles/design-system.css';

// TWM-171: every Build screen (Discover, Destinations, Plan, Plan Builder)
// gets exactly this link, in the same position/style, always pointing at
// Dashboard — never Home, regardless of how deep the traveler is or which
// entry path (Discover→Plan vs. Direct-Plan) got them there.
//
// TWM-185: carries the current trip's id so landing on Dashboard from here
// is reload/bookmark safe too, not just a same-session in-memory jump.
export default function BackToTrip() {
  const { commandSnapshot } = useTrip();
  return (
    <Link className="back-to-trip" to={withTripId('/dashboard', commandSnapshot?.id)}>← Back to trip</Link>
  );
}
