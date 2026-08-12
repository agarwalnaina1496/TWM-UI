import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import Landing from './pages/Landing.jsx';
import ScoutChat from './pages/ScoutChat.jsx';
import Destinations from './pages/Destinations.jsx';
import TripPreview from './pages/TripPreview.jsx';
import Logistics from './pages/Logistics.jsx';
import Login from './pages/Login.jsx';
import RequestQuote from './pages/RequestQuote.jsx';
import Itinerary from './pages/Itinerary.jsx';
import MyTrips from './pages/MyTrips.jsx';
import PlanTrip from './pages/PlanTrip.jsx';
import TripDashboard from './pages/TripDashboard.jsx';

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Landing />} />
        <Route path="/scout-chat" element={<ScoutChat />} />
        <Route path="/plan-trip" element={<PlanTrip />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/trip-preview" element={<TripPreview />} />
        <Route path="/logistics" element={<Logistics />} />
        <Route path="/request-quote" element={<RequestQuote />} />
        <Route path="/itinerary" element={<Itinerary />} />
        <Route path="/dashboard" element={<TripDashboard />} />
        <Route path="/my-trips" element={<MyTrips />} />
      </Routes>
    </>
  );
}
