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
    expect(within(firstRow).getByText(/~100 km/)).toBeInTheDocument();
    expect(within(firstRow).getByText(/~660 km long haul/)).toBeInTheDocument();
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

  it('renders a "routed via" note carrying the long-haul distance for a single hub, no picker', () => {
    renderDrawer({ hubs: [HUBS[0]], selectedHub: HUBS[0], onSelectHub: () => {} });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText(/routed via Udaipur, ~660 km long haul/)).toBeInTheDocument();
  });

  it('both endpoints hubless: destination picker plus an auto "departing via" origin note', () => {
    const originHub = { city: 'Jodhpur', side: 'origin', lastMileKm: 40, lastMileDurationMinutes: 60 };
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
    { mode: 'bus', direct: true, feasible: false, ruledOutReason: 'Too far for a bus (~1,400 km).', hubs: [] },
    { mode: 'drive', direct: true, feasible: false, ruledOutReason: 'Too far for a single road trip (~1,400 km).', hubs: [] },
  ];

  it('starts in State 1 with via summaries and backend ruled-out reasons', async () => {
    const onSelectMode = vi.fn();
    renderDrawer({ modeOptions: MODE_OPTIONS, onSelectMode });

    expect(screen.getByRole('button', { name: /Flight/i })).toHaveTextContent(/Via Udaipur \/ Ahmedabad/);
    // a substantial onward drive stays visible in the chooser; a trivial one does not
    expect(screen.getByRole('button', { name: /Flight/i })).toHaveTextContent(/road transfer/);
    expect(screen.getByRole('button', { name: /Train/i })).toHaveTextContent(/Via Falna/);
    expect(screen.getByRole('button', { name: /Train/i })).toHaveTextContent(/~36 h journey/);
    expect(screen.getByRole('button', { name: /Train/i })).not.toHaveTextContent(/15 km/);
    expect(screen.getByRole('button', { name: /Train/i })).not.toHaveTextContent(/road transfer/);
    expect(screen.getByText('Ruled out')).toBeInTheDocument();
    expect(screen.getByText(/Bus/).closest('li')).toHaveTextContent(/Too far for a bus/);
    expect(screen.getByText(/Drive/).closest('li')).toHaveTextContent(/Too far for a single road trip/);
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
    const selectedGatewayRow = screen.getByRole('radio', { name: /Udaipur/ }).closest('label');
    expect(within(selectedGatewayRow).getByText(/~100 km/)).toBeInTheDocument();
    expect(within(selectedGatewayRow).getByText(/~3 h/)).toBeInTheDocument();
    expect(screen.getByText(/TWM doesn't book this leg/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cab/ })).toBeInTheDocument();
    expect(screen.queryByText(/Other modes/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Recommended mode/)).not.toBeInTheDocument();
    const gateway = screen.getByText('Gateway');
    const book = screen.getByText('Book');
    const onward = screen.getByText(/onward to Sumerpur/);
    expect(gateway.compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(book.compareDocumentPosition(onward) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('State 2 shows origin-side gateway distance before booking when origin has multiple gateways', () => {
    const originHubs = [
      { city: 'Jodhpur', side: 'origin', lastMileKm: 40, lastMileDurationMinutes: 60, feasible: true },
      { city: 'Udaipur', side: 'origin', lastMileKm: 120, lastMileDurationMinutes: 180, feasible: true },
    ];
    renderDrawer({
      modeOptions: [{ mode: 'flight', direct: false, feasible: true, hubs: originHubs }],
      selectedMode: 'flight',
      hubs: originHubs,
      selectedHub: originHubs[0],
      onSelectHub: () => {},
    });

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    const gateway = screen.getByText('Gateway');
    const originNote = screen.getByText(/Getting to Jodhpur/);
    const book = screen.getByText('Book');
    expect(originNote).toHaveTextContent(/from Bengaluru/);
    expect(gateway.compareDocumentPosition(originNote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(originNote.compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('State 1 keeps long-journey note visible for multi-hub railhead options', () => {
    renderDrawer({
      modeOptions: [{
        mode: 'train',
        direct: false,
        feasible: true,
        longJourneyNote: 'Roughly 36 h long-haul journey before the local transfer.',
        hubs: [
          { city: 'Falna', side: 'destination', feasible: true },
          { city: 'Marwar', side: 'destination', feasible: true },
        ],
      }],
      onSelectMode: vi.fn(),
    });

    expect(screen.getByRole('button', { name: /Train/i })).toHaveTextContent(/Via Falna \/ Marwar/);
    expect(screen.getByRole('button', { name: /Train/i })).toHaveTextContent(/~36 h journey/);
  });

  it('State 2 gives the long-journey note callout weight', () => {
    renderDrawer({
      modeOptions: MODE_OPTIONS,
      selectedMode: 'train',
      hubs: MODE_OPTIONS[1].hubs,
      selectedHub: MODE_OPTIONS[1].hubs[0],
      onSelectHub: () => {},
    });

    expect(screen.getByText(/Roughly 36 h long-haul journey/)).toHaveClass('transport-long-journey-note');
  });

  it('maps rail access-gap fallback to train copy and last-mile links', () => {
    const railHub = { city: 'Falna', side: 'destination', accessGap: 'rail', lastMileKm: 15, lastMileDurationMinutes: 25 };
    renderDrawer({
      modeOptions: [{ mode: 'flight', direct: false, feasible: true, hubs: [railHub] }],
      selectedMode: 'train',
      hubs: [railHub],
      selectedHub: railHub,
      onSelectHub: () => {},
    });

    expect(screen.getByText('Railhead')).toBeInTheDocument();
    expect(screen.getByText(/no direct train access/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Auto/ })).toBeInTheDocument();
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

  it('State 2 renders one provider card per transport booking option with capability tags', () => {
    const directTrain = { mode: 'train', direct: true, feasible: true, hubs: [] };
    renderDrawer({
      modeOptions: [directTrain],
      selectedMode: 'train',
      hubs: [],
      options: [
        {
          mode: 'train',
          partner: 'ixigo',
          status: 'resolved',
          name: 'Train: Bengaluru → Sumerpur — ixigo',
          capability: 'destination_search',
          capabilityNote: 'ixigo trains opens with the route context; confirm schedule, seats, and fare on ixigo.',
          ctaLabel: 'Search ixigo trains',
          url: 'https://www.ixigo.com/trains',
        },
        {
          mode: 'train',
          partner: 'irctc',
          status: 'resolved',
          name: 'Train: Bengaluru → Sumerpur — IRCTC',
          capability: 'destination_redirect',
          capabilityNote: 'Official IRCTC train search opens; enter route and date on IRCTC before booking.',
          ctaLabel: 'Open IRCTC',
          url: 'https://www.irctc.co.in/nget/train-search',
        },
      ],
      feasibility: { modes: [{ mode: 'train', status: 'feasible' }] },
    });

    expect(screen.getByText(/Train: Bengaluru → Sumerpur — ixigo/)).toBeInTheDocument();
    expect(screen.getByText(/Train: Bengaluru → Sumerpur — IRCTC/)).toBeInTheDocument();
    expect(screen.getByText('Route search opens on provider')).toBeInTheDocument();
    expect(screen.getByText('Opens provider — pick details there')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Search ixigo trains/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open IRCTC/ })).toBeInTheDocument();
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
