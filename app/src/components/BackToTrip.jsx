import { Link } from 'react-router-dom';
import '../styles/design-system.css';

// TWM-171: every Build screen (Discover, Destinations, Plan, Plan Builder)
// gets exactly this link, in the same position/style, always pointing at
// Dashboard — never Home, regardless of how deep the traveler is or which
// entry path (Discover→Plan vs. Direct-Plan) got them there.
export default function BackToTrip() {
  return (
    <Link className="back-to-trip" to="/dashboard">← Back to trip</Link>
  );
}
