import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TripHero from '../components/TripHero.jsx';
import HonestTransition from '../components/ui/HonestTransition.jsx';
import SupportContent from '../components/SupportContent.jsx';
import BookingPromptOverlay from '../components/drawers/BookingPromptOverlay.jsx';
import { DASHBOARD_TABS, DashboardBackLink, DashboardTabs } from './dashboard/chrome.jsx';
import OverviewTab from './dashboard/OverviewTab.jsx';
import ItineraryTab from './dashboard/ItineraryTab.jsx';
import BookingDrawers from './dashboard/BookingDrawers.jsx';
import { useItineraryData } from '../hooks/useItineraryData.js';
import { useBookingDrawers } from '../hooks/useBookingDrawers.js';
import { useTrip } from '../context/TripContext.jsx';
import { destinationFactRow, contextFactRows, dashboardPrimaryCta } from '../lib/dashboardTracks.js';
import { withTripId } from '../lib/tripUrl.js';
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

// Pre-freeze Overview: "your trip so far" recap + primary next-step CTA.
function ThinStateOverview({ view, tripId }) {
  const navigate = useNavigate();
  const { setCurrentTripId } = useTrip();
  const factRows = [...contextFactRows(view), destinationFactRow(view)];
  const primaryCta = dashboardPrimaryCta(view);

  function go(cta) {
    setCurrentTripId(tripId);
    navigate(withTripId(cta.to, tripId));
  }

  return (
    <>
      <div className="trip-facts content-narrow">
        <h2 className="trip-facts-heading">Your trip so far</h2>
        {factRows.map(row => (
          <div className="trip-facts-row" key={row.label}>
            <span className="trip-facts-label">{row.label}</span>
            {row.cta ? (
              <button type="button" className="btn btn-ghost" onClick={() => go(row.cta)}>{row.cta.label} →</button>
            ) : (
              <span className="trip-facts-value">{row.value}</span>
            )}
          </div>
        ))}
      </div>
      {primaryCta && (
        <div className="thin-state-primary-cta content-narrow">
          <button type="button" className="btn btn-primary" onClick={() => go(primaryCta)}>{primaryCta.label} →</button>
        </div>
      )}
    </>
  );
}

const SUPPORT_SECTION = (
  <section>
    <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with your trip.</p></div></div>
    <SupportContent intro="Questions about your trip, what's next, or how TravelWithMe works — the answers below cover the most common cases." />
  </section>
);

export default function TripDashboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialTab = DASHBOARD_TABS.some(t => t.name === params.get('tab')) ? params.get('tab') : 'Overview';
  const [tab, setTab] = useState(initialTab);
  const [activeDay, setActiveDay] = useState(null);

  const data = useItineraryData();
  const { view, tripId, frozenPlan, itineraryReady, tripLoadStatus, bootStatus, bootError, itineraryStatus, itineraryFetchError, showBookingPrompt, setShowBookingPrompt, days, staySegments, staySegmentByItemId } = data;

  const drawers = useBookingDrawers({ tripId, view, days, staySegments });

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

  // Pre-freeze: unified shell — Overview shows trip-so-far recap, Itinerary
  // shows a placeholder, Support is always accessible.
  if (tripLoadStatus === 'ready' && !frozenPlan) {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <DashboardTabs tab={tab} setTab={setTab} />
        {tab === 'Overview' && <ThinStateOverview view={view} tripId={tripId} />}
        {tab === 'Itinerary' && (
          <div className="dashboard-card thin-tab-placeholder content-narrow">
            <p>Your day-by-day plan will appear here once Guide finishes it.</p>
          </div>
        )}
        {tab === 'Support' && SUPPORT_SECTION}
      </main>
    );
  }

  if (bootStatus === 'error') {
    return <DashboardError title="Itinerary unavailable" message={bootError} />;
  }

  if (itineraryStatus === 'error') {
    return <DashboardError title="Itinerary unavailable" message={itineraryFetchError} />;
  }

  if (bootStatus === 'booting' && !itineraryReady) {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <HonestTransition steps={ARRIVAL_STEPS} label="Building your itinerary" stepDurationMs={ARRIVAL_STEP_DURATION_MS} />
      </main>
    );
  }

  if (!itineraryReady || !view.summary) {
    return (
      <main className="wrap dashboard">
        <DashboardBackLink />
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading your trip…</div>
      </main>
    );
  }

  return (
    <main className="wrap dashboard">
      <DashboardBackLink />
      {showBookingPrompt && (
        <BookingPromptOverlay
          onResolveBookings={() => resolveBookingPrompt('bookings')}
          onLookAround={() => resolveBookingPrompt('overview')}
        />
      )}
      <TripHero
        summary={view.summary}
        actions={<>
          <button className="btn btn-ghost" type="button" onClick={() => alert('PDF generation is not available yet.')}>📄 PDF</button>
        </>}
      />

      <DashboardTabs tab={tab} setTab={setTab} />

      {tab === 'Overview' && <OverviewTab view={view} />}

      {tab === 'Itinerary' && (
        <ItineraryTab
          days={days}
          staySegmentByItemId={staySegmentByItemId}
          activeDay={activeDay}
          onSelectDay={setActiveDay}
          onOpenStay={drawers.openStayDrawer}
          onOpenTransport={drawers.openTransportDrawer}
        />
      )}

      <BookingDrawers drawers={drawers} />

      {tab === 'Support' && <section>
        <div className="tab-intro"><div><h2>💬 Support</h2><p>Get help with this specific itinerary.</p></div></div>
        <SupportContent intro="Swapping something, adjusting dates, or anything unclear about the plan you've already received — the answers below cover the most common cases." />
      </section>}
    </main>
  );
}
