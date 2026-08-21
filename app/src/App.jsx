import { useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import LoginModal, { LoginRouteRedirect } from './components/LoginModal.jsx';
import ClaimConfirmation from './components/ClaimConfirmation.jsx';
import ScoutChat from './pages/ScoutChat.jsx';
import Destinations from './pages/Destinations.jsx';
import TripPreview from './pages/TripPreview.jsx';
import RequestQuote from './pages/RequestQuote.jsx';
import Support from './pages/Support.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import TripDashboard from './pages/TripDashboard.jsx';
import { trackEvent } from './lib/analytics.js';

export default function App() {
  const location = useLocation();
  const trackedVisit = useRef(false);

  // Top-of-funnel: fires once per app load, not per route change — SPA
  // navigation afterward is represented by TWM's own milestone events, not
  // a page_view per route (see analytics.js).
  useEffect(() => {
    if (trackedVisit.current) return;
    trackedVisit.current = true;
    trackEvent('website_visit', { page_path: location.pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <Header />
      <LoginModal />
      <ClaimConfirmation />
      <Routes>
        <Route path="/login" element={<LoginRouteRedirect />} />
        <Route path="/" element={<DashboardHome />} />
        <Route path="/scout-chat" element={<ScoutChat />} />
        {/* TWM-190 (regression fix): /journey-entry is ScoutChat.jsx itself
            now, not a second chat implementation — it's the single
            conversational surface for both a live entry and a resume.
            Keyed by search: switching intent (Plan a Trip <-> Discover
            Destination) while already on this route must fully remount —
            ScoutChat's message history and entry-guard refs are only reset
            on mount, so without a key change React Router keeps the same
            instance and the screen silently shows stale intent state. */}
        <Route path="/journey-entry" element={<ScoutChat key={location.search} />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/trip-preview" element={<TripPreview />} />
        <Route path="/request-quote" element={<RequestQuote />} />
        <Route path="/support" element={<Support />} />
        <Route path="/dashboard" element={<TripDashboard />} />
        <Route path="/my-trips" element={<DashboardHome />} />
      </Routes>
    </div>
  );
}
