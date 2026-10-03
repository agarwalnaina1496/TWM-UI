import { useNavigate } from 'react-router-dom';
import BackToTrip from '../components/BackToTrip.jsx';
import ScreenHeader from '../components/ui/ScreenHeader.jsx';
import Layout from '../components/Layout.jsx';
import DestinationsSection from '../features/destinations/DestinationsSection.jsx';
import YourPickSection from '../features/your-pick/YourPickSection.jsx';
import { useTrip } from '../context/TripContext.jsx';
import { useTripFromUrl } from '../hooks/useTripFromUrl.js';
import { withTripId } from '../lib/tripUrl.js';

// The standalone Destinations screen: page chrome around whichever section
// matches the trip -- the comparison until a destination is chosen, then
// "Your pick". Once planning has started this page hands off to the Plan
// Builder (a plan already generated) or the chat (Guide still asking).
export default function Destinations() {
  useTripFromUrl();
  const navigate = useNavigate();
  const { commandSnapshot: view } = useTrip();
  const selectedOption = view?.lifecycle?.selected_option ?? null;

  function onPlanStarted({ tripId, planReady, message }) {
    if (planReady) navigate(withTripId('/trip-preview', tripId), { state: { guideMessage: message } });
    else navigate(withTripId('/scout-chat', tripId));
  }

  return (
    <Layout>
      <BackToTrip />
      <ScreenHeader
        eyebrow="Destination matcher"
        title={<>Let's find <em>your</em> place</>}
        lede={selectedOption
          ? `Your destination is set: ${selectedOption.name}.`
          : 'Matching against what you just told me — ranked by how well each fits.'}
      />
      {selectedOption ? <YourPickSection onPlanStarted={onPlanStarted} /> : <DestinationsSection />}
    </Layout>
  );
}
