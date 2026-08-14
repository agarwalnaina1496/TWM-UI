import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, logout, setPendingReturnTo } = useTrip();

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

  return (
    <header>
      <div className="header-inner">
        <Link className="brand" to="/">Travel<em>WithMe</em></Link>
        <div className="header-nav-group">
          {auth.loggedIn
            ? <span className="logout-link" onClick={handleLogout}>Log out</span>
            : <span className="login-link" onClick={handleLogin}>Log in</span>}
        </div>
      </div>
    </header>
  );
}
