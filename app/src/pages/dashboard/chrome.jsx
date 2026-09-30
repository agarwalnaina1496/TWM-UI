// TWM-175/198/206: down from 7 tabs — Map folded into Overview, Docs/Bookings
// retired. Transport/Stay resolution lives inline on the Itinerary item now.
export const DASHBOARD_TABS = [
  { name: 'Overview', icon: '📊' },
  { name: 'Itinerary', icon: '📅' },
  { name: 'Support', icon: '💬' },
];

// TWM-234: Dashboard's back-link moved to the shared BackToTrip component
// (components/BackToTrip.jsx) — it now derives "back to your trips" vs.
// "back to trip" from the current route itself, so Dashboard no longer needs
// its own separate implementation.

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
