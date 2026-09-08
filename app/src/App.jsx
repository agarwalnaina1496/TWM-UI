import { lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import LoginModal, { LoginRouteRedirect } from './components/LoginModal.jsx';
import ClaimConfirmation from './components/ClaimConfirmation.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import { trackEvent } from './lib/analytics.js';

// TWM-219: DashboardHome (the `/` + `/my-trips` landing) stays eager — every
// visitor lands there first. Every other route is its own lazy chunk.
const ScoutChat = lazy(() => import('./pages/ScoutChat.jsx'));
const Destinations = lazy(() => import('./pages/Destinations.jsx'));
const TripPreview = lazy(() => import('./pages/TripPreview.jsx'));
const RequestQuote = lazy(() => import('./pages/RequestQuote.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const TripDashboard = lazy(() => import('./pages/TripDashboard.jsx'));

function RouteFallback() {
  return (
    <div className="think" role="status" aria-label="Loading">
      <span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span>
    </div>
  );
}

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginRouteRedirect />} />
          <Route path="/" element={<DashboardHome />} />
          <Route path="/scout-chat" element={<ScoutChat />} />
          {/* TWM-190: /journey-entry is ScoutChat.jsx itself — the single
              conversational surface for both a live entry and a resume.
              Keyed by search so switching intent (Plan a Trip <-> Discover
              Destination) fully remounts (ScoutChat's message history and
              entry-guard refs only reset on mount). */}
          <Route path="/journey-entry" element={<ScoutChat key={location.search} />} />
          <Route path="/destinations" element={<Destinations />} />
          <Route path="/trip-preview" element={<TripPreview />} />
          <Route path="/request-quote" element={<RequestQuote />} />
          <Route path="/support" element={<Support />} />
          <Route path="/dashboard" element={<TripDashboard />} />
          <Route path="/my-trips" element={<DashboardHome />} />
        </Routes>
      </Suspense>
    </div>
  );
}
