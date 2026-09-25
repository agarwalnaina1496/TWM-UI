import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TripHero from '../components/TripHero.jsx';
import SupportContent from '../components/SupportContent.jsx';
import BookingPromptOverlay from '../components/drawers/BookingPromptOverlay.jsx';
import { DASHBOARD_TABS, DashboardBackLink, DashboardTabs } from './dashboard/chrome.jsx';
import OverviewTab from './dashboard/OverviewTab.jsx';
import ItineraryTab from './dashboard/ItineraryTab.jsx';
import BookingDrawers from './dashboard/BookingDrawers.jsx';
import { useItineraryData } from '../hooks/useItineraryData.js';
import { useBookingDrawers } from '../hooks/useBookingDrawers.js';
import { trackEvent } from '../lib/analytics.js';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import '../styles/dashboard.css';

const ARRIVAL_STEPS = ['Reviewing your approved plan', 'Building your day-by-day itinerary', 'Checking practical details'];
const ARRIVAL_STEP_DURATION_MS = 20000;

function DashboardError({ title, message }) {
  return (
    <main className="wrap dashboard">
      <DashboardBackLink />
      <ErrorBanner message={<><strong>{title}</strong><span>{message}</span></>} />
    </main>
  );
}

function SupportTab({ itineraryReady }) {
  const intro = itineraryReady
    ? 'Swapping something, adjusting dates, or anything unclear about the plan you\'ve already received — the answers below cover the most common cases.'
    : 'Questions about your trip, what\'s next, or how TravelWithMe works — the answers below cover the most common cases.';
  return (
    <section>
      <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with your trip.</p></div></div>
      <SupportContent intro={intro} />
    </section>
  );
}

export default function TripDashboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialTab = DASHBOARD_TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Overview';
  const [tab, setTab] = useState(initialTab);
  const [activeDay, setActiveDay] = useState(null);

  const data = useItineraryData();
  const { view, tripId, itineraryReady, tripLoadStatus, bootStatus, bootError, itineraryStatus, itineraryFetchError, showBookingPrompt, setShowBookingPrompt, days, staySegments, staySegmentByItemId } = data;

  const drawers = useBookingDrawers({ tripId, view, days, staySegments });

  const building = bootStatus === 'booting' && !itineraryReady;

  // Owned here (not inside ItineraryTab/HonestTransition) so the honest-
  // transition steps keep advancing in real wall-clock time regardless of
  // which tab is active — switching to Overview/Support and back mid-build
  // no longer pauses or restarts the current step from zero.
  const [buildingActiveIndex, setBuildingActiveIndex] = useState(0);
  useEffect(() => {
    if (!building || buildingActiveIndex >= ARRIVAL_STEPS.length - 1) return;
    const timer = setTimeout(() => setBuildingActiveIndex(i => Math.min(i + 1, ARRIVAL_STEPS.length - 1)), ARRIVAL_STEP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [building, buildingActiveIndex]);

  // Land the traveler on the tab that's actually building, once, the first
  // time this state is seen — not on every render, and not overriding a
  // manual tab switch (or an explicit ?tab= deep link) afterward.
  const autoTabApplied = useRef(false);
  useEffect(() => {
    if (autoTabApplied.current || !building) return;
    autoTabApplied.current = true;
    if (!params.get('tab')) setTab('Itinerary');
  }, [building, params]);

  function resolveBookingPrompt(destination) {
    trackEvent('booking_prompt_choice', { choice: destination });
    setShowBookingPrompt(false);
    if (destination === 'bookings') setTab('Itinerary');
  }

  if (tripLoadStatus === 'ready' && !view) {
    return (
      <main className="wrap dashboard">
        <ErrorBanner message={<><strong>Trip unavailable</strong><span>This trip is no longer available.</span></>} />
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Back to your trips</button>
      </main>
    );
  }

  if (bootStatus === 'error') {
    return <DashboardError title="Itinerary unavailable" message={bootError} />;
  }

  if (itineraryStatus === 'error') {
    return <DashboardError title="Itinerary unavailable" message={itineraryFetchError} />;
  }

  // Single shell: tab content branches per tab, stage-aware internally.
  // The tab bar and Support are always present once a view exists.
  return (
    <main className="wrap dashboard">
      <DashboardBackLink />
      {showBookingPrompt && (
        <BookingPromptOverlay
          onResolveBookings={() => resolveBookingPrompt('bookings')}
          onLookAround={() => resolveBookingPrompt('overview')}
        />
      )}
      {view && (
        <TripHero
          view={view}
          actions={<>
            <button className="btn btn-ghost" type="button" onClick={() => alert('PDF generation is not available yet.')}>📄 PDF</button>
          </>}
        />
      )}

      <DashboardTabs tab={tab} setTab={setTab} />

      {tab === 'Overview' && view && (
        <OverviewTab view={view} tripId={tripId} />
      )}

      {tab === 'Itinerary' && (
        <ItineraryTab
          days={days}
          staySegmentByItemId={staySegmentByItemId}
          activeDay={activeDay}
          onSelectDay={setActiveDay}
          onOpenStay={drawers.openStayDrawer}
          onOpenTransport={drawers.openTransportDrawer}
          building={building}
          buildingSteps={ARRIVAL_STEPS}
          buildingActiveIndex={buildingActiveIndex}
        />
      )}

      <BookingDrawers drawers={drawers} />

      {tab === 'Support' && <SupportTab itineraryReady={itineraryReady} />}
    </main>
  );
}
