import { Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ROUTES } from '../constants/routes.js';
import '../styles/design-system.css';

// TWM-234: the one shared back-link, used by every trip-scoped screen
// (Chat, Destinations, Plan Builder, Dashboard). Flat, not hierarchical —
// always "back to your trips", never an intermediate "back to trip" stop at
// Dashboard. There is one hub (the trips list); every trip screen, Dashboard
// included, points straight to it. Renders nothing until a trip exists.
export default function BackToTrip() {
  const { currentTripId } = useTrip();
  if (!currentTripId) return null;
  return <Link className="back-to-trip" to={ROUTES.home}>← Back to your trips</Link>;
}
