import { DISCOVER_STAGES } from '../../constants/tripStages.js';

// TWM-175/198/206: down from 7 tabs — Map folded into Overview, Docs/Bookings
// retired. Transport/Stay resolution lives inline on the Itinerary item now.
export const DASHBOARD_TABS = [
  { name: 'Overview', icon: '📊' },
  { name: 'Itinerary', icon: '📅' },
  { name: 'Support', icon: '💬' },
];

// TWM-234: a trip still in Discover (no plan started yet) has nothing to
// show on Itinerary -- and showing the tab anyway implies Discover and Plan
// are one fixed pipeline the traveler must walk through. Hide it until
// planning actually starts; a reopen back into Discover clears the day plan
// (planner_commands._clear_planner_for_reopen) and moves stage back too, so
// gating on stage alone is enough to hide it again on the way back.

export function visibleDashboardTabs(stage) {
  if (DISCOVER_STAGES.has(stage)) return DASHBOARD_TABS.filter(t => t.name !== 'Itinerary');
  return DASHBOARD_TABS;
}

// TWM-234: Dashboard's back-link moved to the shared BackToTrip component
// (components/BackToTrip.jsx) — flat, always "back to your trips", so
// Dashboard no longer needs its own separate implementation.

export function DashboardTabs({ tab, setTab, tabs = DASHBOARD_TABS }) {
  return (
    <nav className="dashboard-tabs" aria-label="Trip Dashboard tabs">
      {tabs.map(({ name, icon }) => (
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
