import { Link, useLocation } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { withTripId } from '../lib/tripUrl.js';
import { ROUTES } from '../constants/routes.js';
import '../styles/design-system.css';

// TWM-234: the one shared trip-context back-link, used by every trip-scoped
// screen (Chat, Destinations, Plan Builder, Dashboard) — previously two
// separate implementations (this component and Dashboard's own
// DashboardBackLink) with different destinations/labels, and this one's
// visibility was gated on the URL's ?intent= entry flavor rather than trip
// existence, so the same conversation state showed a back-link on some entry
// paths and not others. Now derived purely from trip existence and current
// route: nothing renders until a trip exists; Dashboard itself points up to
// the trips list, every other trip screen points to Dashboard.
export default function BackToTrip() {
  const { currentTripId } = useTrip();
  const location = useLocation();
  if (!currentTripId) return null;
  if (location.pathname === ROUTES.dashboard) {
    return <Link className="back-to-trip" to={ROUTES.home}>← Back to your trips</Link>;
  }
  return (
    <Link className="back-to-trip" to={withTripId(ROUTES.dashboard, currentTripId)}>← Back to trip</Link>
  );
}
