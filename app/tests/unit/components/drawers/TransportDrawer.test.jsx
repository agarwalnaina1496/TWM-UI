import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransportDrawer from '../../../../src/components/drawers/TransportDrawer.jsx';

const LEG = { from: 'Bengaluru', to: 'Sumerpur' };
const HUBS = [
  { city: 'Udaipur', side: 'destination', lastMileKm: 100, lastMileDurationMinutes: 150, feasibleModes: ['flight', 'train', 'bus'] },
  { city: 'Rail Junction', side: 'destination', lastMileKm: 60, lastMileDurationMinutes: 90, feasibleModes: ['train', 'bus'] },
];

function renderDrawer(props = {}) {
  return render(
    <TransportDrawer
      leg={LEG} options={[]} feasibility={{ modes: [] }}
      loading={false} error={null} dateRow={null} partyRow={null} onClose={() => {}}
      {...props}
    />,
  );
}

describe('TransportDrawer — TWM-215 hub picker', () => {
  it('renders a radio row per candidate hub with its last-mile estimate and feasible modes', () => {
    renderDrawer({ hubs: HUBS, selectedHubCity: 'Udaipur', onSelectHub: () => {} });
    const rows = screen.getAllByRole('radio');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('aria-checked', 'true');
    expect(within(rows[0]).getByText(/100 km/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Flight/)).toBeInTheDocument();
    // rail-only hub: train + bus, no flight
    expect(within(rows[1]).queryByText(/Flight/)).not.toBeInTheDocument();
    expect(within(rows[1]).getByText(/Train/)).toBeInTheDocument();
  });

  it('calls onSelectHub when another hub row is clicked', async () => {
    const onSelectHub = vi.fn();
    renderDrawer({ hubs: HUBS, selectedHubCity: 'Udaipur', onSelectHub });
    await userEvent.click(screen.getByRole('radio', { name: /Rail Junction/ }));
    expect(onSelectHub).toHaveBeenCalledWith('Rail Junction');
  });

  it('shows the passive last-mile note for the selected hub, not a control', () => {
    renderDrawer({ hubs: HUBS, selectedHubCity: 'Udaipur', onSelectHub: () => {} });
    const note = screen.getByText(/onward to Sumerpur/);
    expect(note).toBeInTheDocument();
    expect(note.closest('button')).toBeNull();
  });

  it('renders a plain "routed via" note for a single hub, no picker', () => {
    renderDrawer({ hubs: [HUBS[0]], selectedHubCity: 'Udaipur', onSelectHub: () => {} });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText(/routed via Udaipur/)).toBeInTheDocument();
  });

  it('shows the honest empty message for a gateway leg with no hubs and no options', () => {
    renderDrawer({ hubs: [] });
    expect(screen.getByText('No direct transport identified for this leg.')).toBeInTheDocument();
  });
});
