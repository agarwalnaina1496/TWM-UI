import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import GetStarted from './pages/GetStarted.jsx';
import ScoutChat from './pages/ScoutChat.jsx';
import Destinations from './pages/Destinations.jsx';
import TripPreview from './pages/TripPreview.jsx';
import Logistics from './pages/Logistics.jsx';
import Login from './pages/Login.jsx';
import RequestQuote from './pages/RequestQuote.jsx';
import Itinerary from './pages/Itinerary.jsx';
import MyTrips from './pages/MyTrips.jsx';
import JourneyEntry from './pages/JourneyEntry.jsx';
import TripDashboard from './pages/TripDashboard.jsx';

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<GetStarted />} />
        <Route path="/scout-chat" element={<ScoutChat />} />
        <Route path="/journey-entry" element={<JourneyEntry />} />
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
