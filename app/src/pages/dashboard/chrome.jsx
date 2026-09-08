import { Link } from 'react-router-dom';

// TWM-175/198/206: down from 7 tabs — Map folded into Overview, Docs/Bookings
// retired. Transport/Stay resolution lives inline on the Itinerary item now.
export const DASHBOARD_TABS = [
  { name: 'Overview', icon: '📊' },
  { name: 'Itinerary', icon: '📅' },
  { name: 'Support', icon: '💬' },
];

export function DashboardBackLink() {
  return <Link className="back-to-trip" to="/">← Back to your trips</Link>;
}

export function DashboardTabs({ tab, setTab }) {
  return (
    <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">
      {DASHBOARD_TABS.map(({ name, icon }) => (
        <button
          type="button"
          key={name}
          aria-current={tab === name ? 'page' : undefined}
          className={tab === name ? 'active' : ''}
          onClick={() => setTab(name)}
        >
          <span className="tab-icon">{icon}</span> {name}
        </button>
      ))}
    </nav>
  );
}
