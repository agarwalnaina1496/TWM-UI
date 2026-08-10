import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import { useTrip } from './context/TripContext.jsx';
import GetStarted from './pages/GetStarted.jsx';
import ScoutChat from './pages/ScoutChat.jsx';
import Destinations from './pages/Destinations.jsx';
import TripPreview from './pages/TripPreview.jsx';
import Logistics from './pages/Logistics.jsx';
import ChoosePlan from './pages/ChoosePlan.jsx';
import Login from './pages/Login.jsx';
import Payment from './pages/Payment.jsx';
import RequestQuote from './pages/RequestQuote.jsx';
import Itinerary from './pages/Itinerary.jsx';
import MyTrips from './pages/MyTrips.jsx';
import JourneyEntry from './pages/JourneyEntry.jsx';

function RequireAuth({ children }) {
  const { hasAccess } = useTrip();
  if (!hasAccess) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><GetStarted /></RequireAuth>} />
        <Route path="/scout-chat" element={<RequireAuth><ScoutChat /></RequireAuth>} />
        <Route path="/journey-entry" element={<RequireAuth><JourneyEntry /></RequireAuth>} />
        <Route path="/destinations" element={<RequireAuth><Destinations /></RequireAuth>} />
        <Route path="/trip-preview" element={<RequireAuth><TripPreview /></RequireAuth>} />
        <Route path="/logistics" element={<RequireAuth><Logistics /></RequireAuth>} />
        <Route path="/choose-plan" element={<RequireAuth><ChoosePlan /></RequireAuth>} />
        <Route path="/payment" element={<RequireAuth><Payment /></RequireAuth>} />
        <Route path="/request-quote" element={<RequireAuth><RequestQuote /></RequireAuth>} />
        <Route path="/itinerary" element={<RequireAuth><Itinerary /></RequireAuth>} />
        <Route path="/my-trips" element={<RequireAuth><MyTrips /></RequireAuth>} />
      </Routes>
    </>
  );
}
