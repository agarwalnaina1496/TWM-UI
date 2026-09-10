import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransportDrawer from '../../../../src/components/drawers/TransportDrawer.jsx';

const LEG = { from: 'Bengaluru', to: 'Sumerpur' };
const HUBS = [
  { city: 'Udaipur', side: 'destination', lastMileKm: 100, lastMileDurationMinutes: 150, longHaulDistanceKm: 660 },
  { city: 'Rail Junction', side: 'destination', lastMileKm: 60, lastMileDurationMinutes: 90, longHaulDistanceKm: 300 },
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
  it('renders a native radio per candidate hub with distance context', () => {
    renderDrawer({ hubs: HUBS, selectedHub: HUBS[0], onSelectHub: () => {} });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(radios[0].tagName).toBe('INPUT');
    const firstRow = radios[0].closest('label');
    expect(within(firstRow).getByText(/100 km/)).toBeInTheDocument();
    expect(within(firstRow).getByText(/660 km long haul/)).toBeInTheDocument();
    const secondRow = radios[1].closest('label');
    expect(within(secondRow).queryByText(/No modes resolved/)).not.toBeInTheDocument();
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
    expect(screen.getByText(/start via/)).toHaveTextContent(/Jodhpur/);
    expect(screen.getByText(/from Bengaluru/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2); // destination side only
  });

  it('shows the honest empty message for a gateway leg with no hubs and no options', () => {
    renderDrawer({ hubs: [] });
    expect(screen.getByText('No direct transport identified for this leg.')).toBeInTheDocument();
  });
});

describe('TransportDrawer — TWM-230 per-mode chooser', () => {
  const MODE_OPTIONS = [
    {
      mode: 'flight',
      direct: false,
      feasible: true,
      hubs: [
        { city: 'Udaipur', side: 'destination', lastMileKm: 100, lastMileDurationMinutes: 150, feasible: true },
        { city: 'Ahmedabad', side: 'destination', lastMileKm: 220, lastMileDurationMinutes: 300, feasible: true },
      ],
    },
    { mode: 'train', direct: false, feasible: true, longJourneyNote: 'Roughly 36 h long-haul journey before the local transfer.', hubs: [
      { city: 'Falna', side: 'destination', lastMileKm: 15, lastMileDurationMinutes: 25, longHaulDistanceKm: 1600, feasible: true },
    ] },
    { mode: 'bus', direct: true, feasible: false, ruledOutReason: 'Too far for bus under TWM rule (~1,400 km).', hubs: [] },
    { mode: 'drive', direct: true, feasible: false, ruledOutReason: 'Too far for a single-trip drive under TWM rule (~1,400 km).', hubs: [] },
  ];

  it('starts in State 1 with via summaries and backend ruled-out reasons', async () => {
    const onSelectMode = vi.fn();
    renderDrawer({ modeOptions: MODE_OPTIONS, onSelectMode });

    expect(screen.getByRole('button', { name: /Flight/i })).toHaveTextContent(/Via Udaipur \/ Ahmedabad/);
    expect(screen.getByRole('button', { name: /Train/i })).toHaveTextContent(/Via Falna/);
    expect(screen.getByRole('button', { name: /Train/i })).toHaveTextContent(/Roughly 36 h/);
    expect(screen.getByText('Ruled out')).toBeInTheDocument();
    expect(screen.getByText(/Bus/).closest('li')).toHaveTextContent(/Too far for bus/);
    expect(screen.getByText(/Drive/).closest('li')).toHaveTextContent(/Too far for a single-trip drive/);
    expect(screen.getByRole('heading', { name: 'Bengaluru → Sumerpur' })).toBeInTheDocument();
    expect(screen.queryByText('Bengaluru → Sumerpur', { selector: 'p' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Flight/i }));
    expect(onSelectMode).toHaveBeenCalledWith('flight');
  });

  it('State 2 shows only the selected mode hub picker and back returns to State 1', async () => {
    const onBack = vi.fn();
    renderDrawer({
      modeOptions: MODE_OPTIONS,
      selectedMode: 'flight',
      hubs: MODE_OPTIONS[0].hubs,
      selectedHub: MODE_OPTIONS[0].hubs[0],
      onSelectHub: () => {},
      onBack,
    });

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText(/TWM doesn't book this leg/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cab/ })).toBeInTheDocument();
    expect(screen.queryByText(/Other modes/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Recommended mode/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('direct selected mode skips the hub picker', () => {
    const directFlight = { mode: 'flight', direct: true, feasible: true, hubs: [] };
    renderDrawer({
      modeOptions: [directFlight],
      selectedMode: 'flight',
      hubs: [],
      options: [{ mode: 'flight', status: 'resolved', name: 'Flight: Bengaluru → Sumerpur' }],
      feasibility: { modes: [{ mode: 'flight', status: 'feasible' }] },
    });

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText(/TWM doesn't book this leg/)).not.toBeInTheDocument();
    expect(screen.getByText(/Flight: Bengaluru/)).toBeInTheDocument();
  });

  it('State 2 keeps other chooser-eligible modes out of the unavailable list', () => {
    renderDrawer({
      modeOptions: MODE_OPTIONS,
      selectedMode: 'flight',
      hubs: MODE_OPTIONS[0].hubs,
      selectedHub: MODE_OPTIONS[0].hubs[0],
      onSelectHub: () => {},
    });

    expect(screen.queryByText(/Other modes/)).not.toBeInTheDocument();
  });

  it('State 1 explains when every per-mode option is ruled out', () => {
    renderDrawer({
      modeOptions: [{ mode: 'flight', direct: false, feasible: false, ruledOutReason: 'No route resolved.', hubs: [{ city: 'Udaipur', feasible: false }] }],
      onSelectMode: vi.fn(),
    });

    expect(screen.getByRole('status')).toHaveTextContent('No feasible transport identified for this leg.');
    expect(screen.queryByRole('button', { name: /Flight/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Flight/).closest('li')).toHaveTextContent(/No route resolved/);
  });
});
