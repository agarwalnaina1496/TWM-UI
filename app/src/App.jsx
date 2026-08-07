import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import GetStarted from './pages/GetStarted.jsx';
import TripDetails from './pages/TripDetails.jsx';
import Destinations from './pages/Destinations.jsx';
import TripPreview from './pages/TripPreview.jsx';
import Logistics from './pages/Logistics.jsx';
import ChoosePlan from './pages/ChoosePlan.jsx';
import Login from './pages/Login.jsx';
import Payment from './pages/Payment.jsx';
import RequestQuote from './pages/RequestQuote.jsx';
import Itinerary from './pages/Itinerary.jsx';
import MyTrips from './pages/MyTrips.jsx';

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<GetStarted />} />
        <Route path="/trip-details" element={<TripDetails />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/trip-preview" element={<TripPreview />} />
        <Route path="/logistics" element={<Logistics />} />
        <Route path="/choose-plan" element={<ChoosePlan />} />
        <Route path="/login" element={<Login />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/request-quote" element={<RequestQuote />} />
        <Route path="/itinerary" element={<Itinerary />} />
        <Route path="/my-trips" element={<MyTrips />} />
      </Routes>
    </>
  );
}
