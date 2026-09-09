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
  it('renders a native radio per candidate hub with its last-mile estimate and feasible modes', () => {
    renderDrawer({ hubs: HUBS, selectedHub: HUBS[0], onSelectHub: () => {} });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(radios[0].tagName).toBe('INPUT');
    const firstRow = radios[0].closest('label');
    expect(within(firstRow).getByText(/100 km/)).toBeInTheDocument();
    expect(within(firstRow).getByText(/Flight/)).toBeInTheDocument();
    const secondRow = radios[1].closest('label');
    expect(within(secondRow).queryByText(/Flight/)).not.toBeInTheDocument();
    expect(within(secondRow).getByText(/Train/)).toBeInTheDocument();
  });

  it('calls onSelectHub when another hub radio is chosen', async () => {
    const onSelectHub = vi.fn();
    renderDrawer({ hubs: HUBS, selectedHub: HUBS[0], onSelectHub });
    await userEvent.click(screen.getByRole('radio', { name: /Rail Junction/ }));
    expect(onSelectHub).toHaveBeenCalledWith('Rail Junction');
  });

  it('shows the passive last-mile note for the selected hub, not a control', () => {
    renderDrawer({ hubs: HUBS, selectedHub: HUBS[0], onSelectHub: () => {} });
    const note = screen.getByText(/onward to Sumerpur/);
    expect(note).toBeInTheDocument();
    expect(note.closest('button')).toBeNull();
    expect(note.closest('label')).toBeNull();
  });

  it('renders a plain "routed via" note for a single hub, no picker', () => {
    renderDrawer({ hubs: [HUBS[0]], selectedHub: HUBS[0], onSelectHub: () => {} });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText(/routed via Udaipur/)).toBeInTheDocument();
  });

  it('both endpoints hubless: destination picker plus an auto "departing via" origin note', () => {
    const originHub = { city: 'Jodhpur', side: 'origin', lastMileKm: 40, lastMileDurationMinutes: 60, feasibleModes: ['train'] };
    renderDrawer({ hubs: HUBS, selectedHub: HUBS[0], autoOriginHub: originHub, onSelectHub: () => {} });
    expect(screen.getByText(/departing via Jodhpur/)).toBeInTheDocument();
    expect(screen.getByText(/from Bengaluru/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2); // destination side only
  });

  it('shows the honest empty message for a gateway leg with no hubs and no options', () => {
    renderDrawer({ hubs: [] });
    expect(screen.getByText('No direct transport identified for this leg.')).toBeInTheDocument();
  });
});
