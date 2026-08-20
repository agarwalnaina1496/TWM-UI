import SupportContent from '../components/SupportContent.jsx';
import '../styles/dashboard.css';

// TWM-176: a trip-independent Support surface — reachable from Home's
// header with zero trips in progress, for account-level issues that
// don't require an open trip. The Dashboard Support tab (trip-specific
// framing) reuses the same SupportContent.
export default function Support() {
  return (
    <main className="wrap dashboard">
      <h1 className="hero-title">We're here to <em>help</em></h1>
      <SupportContent intro="Have a question about your account or how TravelWithMe works? Reach out any time, whether or not you have a trip open." />
      <p className="footer-bottom">&copy; {new Date().getFullYear()} TravelWithMe. All rights reserved.</p>
    </main>
  );
}
