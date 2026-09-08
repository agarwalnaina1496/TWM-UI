import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../../context/TripContext.jsx';
import { withTripId } from '../../lib/tripUrl.js';
import { destinationFactRow, contextFactRows, dashboardPrimaryCta } from '../../lib/dashboardTracks.js';
import { DASHBOARD_TABS, DashboardBackLink } from './chrome.jsx';

function DashboardCtaButton({ cta, tripId, className }) {
  const navigate = useNavigate();
  const { openTrip } = useTrip();
  const [pending, setPending] = useState(false);

  async function go() {
    if (pending) return;
    setPending(true);
    try {
      await openTrip(tripId);
      navigate(withTripId(cta.to, tripId));
    } finally {
      setPending(false);
    }
  }

  return <button type="button" className={className} disabled={pending} onClick={go}>{cta.label} →</button>;
}

function ThinStateTabPlaceholder({ tab }) {
  const note = tab === 'Itinerary'
    ? 'Your day-by-day plan will appear here once Guide finishes it.'
    : 'Available once your itinerary is ready.';
  return (
    <div className="dashboard-card thin-tab-placeholder content-narrow">
      <p>{note}</p>
    </div>
  );
}

// TWM-175/182/220: the Dashboard before a plan is frozen — a per-state
// Overview recap and one actionable next step, rendered entirely from
// `TripView` (lifecycle / context_recap / plan).
export default function ThinStateDashboard({ view, tripId }) {
  const [tab, setTab] = useState('Overview');
  const factRows = [...contextFactRows(view), destinationFactRow(view)];
  const primaryCta = dashboardPrimaryCta(view);
  return (
    <main className="wrap dashboard">
      <DashboardBackLink />
      <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">
        {DASHBOARD_TABS.map(({ name, icon }) => (
          <button type="button" aria-current={tab === name ? 'page' : undefined} className={tab === name ? 'active' : ''} key={name} onClick={() => setTab(name)}>
            <span className="tab-icon">{icon}</span> {name}
          </button>
        ))}
      </nav>

      {tab === 'Overview' ? (
        <>
          <div className="trip-facts content-narrow">
            <h2 className="trip-facts-heading">Your trip so far</h2>
            {factRows.map(row => (
              <div className="trip-facts-row" key={row.label}>
                <span className="trip-facts-label">{row.label}</span>
                {row.cta ? (
                  <DashboardCtaButton cta={row.cta} tripId={tripId} className="btn btn-ghost" />
                ) : (
                  <span className="trip-facts-value">{row.value}</span>
                )}
              </div>
            ))}
          </div>
          {primaryCta && (
            <div className="thin-state-primary-cta content-narrow">
              <DashboardCtaButton cta={primaryCta} tripId={tripId} className="btn btn-primary" />
            </div>
          )}
        </>
      ) : (
        <ThinStateTabPlaceholder tab={tab} />
      )}
    </main>
  );
}
