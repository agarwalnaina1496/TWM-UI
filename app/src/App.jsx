import { useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import LoginModal, { LoginRouteRedirect } from './components/LoginModal.jsx';
import ScoutChat from './pages/ScoutChat.jsx';
import Destinations from './pages/Destinations.jsx';
import TripPreview from './pages/TripPreview.jsx';
import Logistics from './pages/Logistics.jsx';
import RequestQuote from './pages/RequestQuote.jsx';
import Itinerary from './pages/Itinerary.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import JourneyEntry from './pages/JourneyEntry.jsx';
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
    <>
      <Header />
      <LoginModal />
      <Routes>
        <Route path="/login" element={<LoginRouteRedirect />} />
        <Route path="/" element={<DashboardHome />} />
        <Route path="/scout-chat" element={<ScoutChat />} />
        {/* keyed by search: switching intent (Plan a Trip <-> Discover
            Destination) while already on this route must fully remount —
            JourneyEntry's message history and entry-guard refs are only
            reset on mount, so without a key change React Router keeps the
            same instance and the screen silently shows stale intent state. */}
        <Route path="/journey-entry" element={<JourneyEntry key={location.search} />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/trip-preview" element={<TripPreview />} />
        <Route path="/logistics" element={<Logistics />} />
        <Route path="/request-quote" element={<RequestQuote />} />
        <Route path="/itinerary" element={<Itinerary />} />
        <Route path="/dashboard" element={<TripDashboard />} />
        <Route path="/my-trips" element={<DashboardHome />} />
      </Routes>
    </>
  );
}
