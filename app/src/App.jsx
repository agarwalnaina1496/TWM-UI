import { useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import GetStarted from './pages/GetStarted.jsx';
import ScoutChat from './pages/ScoutChat.jsx';
import Destinations from './pages/Destinations.jsx';
import TripPreview from './pages/TripPreview.jsx';
import Logistics from './pages/Logistics.jsx';
import Login from './pages/Login.jsx';
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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<DashboardHome />} />
        <Route path="/new-trip" element={<GetStarted />} />
        <Route path="/scout-chat" element={<ScoutChat />} />
        <Route path="/journey-entry" element={<JourneyEntry />} />
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
