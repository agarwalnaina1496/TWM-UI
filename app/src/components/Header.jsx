import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { trackEvent } from '../lib/analytics.js';

// Persistent header nav (TWM-164): "Plan a Trip" and "Discover Destination"
// are independent, backend-confirmed entry paths (known_destination vs
// discover — different commands, different specialists) that only converge
// later, so they're both always-available nav items rather than a one-time
// intermediate picker screen. Each starts a fresh trip context before
// navigating, matching the prior "+ New Trip" behavior — clicking either
// while an existing trip is current must not silently mutate it.
export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, logout, setPendingReturnTo, startNewTrip } = useTrip();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // Explicit Header "Log in" is deliberate traveler intent, so it may open
  // Login directly (TWM-140) — unlike contextual invitations elsewhere.
  function handleLogin() {
    setPendingReturnTo(location.pathname);
    navigate('/login');
  }

  function handlePlanTrip() {
    trackEvent('intent_selected', { intent: 'plan' });
    startNewTrip();
    navigate(`/journey-entry?intent=${ENTRY_INTENTS.KNOWN_DESTINATION}`);
  }

  function handleDiscover() {
    trackEvent('intent_selected', { intent: 'discover' });
    startNewTrip();
    navigate(`/journey-entry?intent=${ENTRY_INTENTS.DISCOVER}`);
  }

  return (
    <header>
      <div className="header-inner">
        <Link className="brand" to="/">Travel<em>WithMe</em></Link>
        <nav className="header-nav-tabs" aria-label="Primary">
          <span className="nav-tab" onClick={handlePlanTrip}>Plan a Trip</span>
          <span className="nav-tab" onClick={handleDiscover}>Discover Destination</span>
        </nav>
        <div className="header-nav-group">
          {auth.loggedIn
            ? <span className="logout-link" onClick={handleLogout}>Log out</span>
            : <span className="login-link" onClick={handleLogin}>Log in</span>}
        </div>
      </div>
    </header>
  );
}
