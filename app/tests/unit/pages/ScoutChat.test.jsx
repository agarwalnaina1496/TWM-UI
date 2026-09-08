import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScoutChat from '../../../src/pages/ScoutChat.jsx';

const navigate = vi.fn();
let commandSnapshot;
let sendTripCommand;
let tripLoadStatus;
let openTrip;
let setCurrentTripId;
let searchParams = new URLSearchParams();

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand, tripLoadStatus, currentTripId: commandSnapshot?.id ?? null, setCurrentTripId, prefetchTrip: openTrip }),
}));
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
  useSearchParams: () => [searchParams],
}));

// TWM-220: commandSnapshot is a `TripView`.
function recap(entries) {
  return Object.entries(entries).map(([key, value]) => ({ key, label: key, value }));
}
function view({ stage = 'new', activeAgent = null, context = {}, plan = null, matcher = {} } = {}) {
  return {
    id: 'trip-1',
    lifecycle: { stage, status: 'free', active_agent: activeAgent, selected_option: null },
    context_recap: recap(context), plan,
    matcher: { last_message: null, awaiting: null, has_recommendation: false, ...matcher },
  };
}
const readyPlan = () => ({ places: ['Abbey Falls'], day_plan: [{ day_number: 1, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null }], frozen: false, awaiting: null });

describe('ScoutChat advice-entry chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandSnapshot = null;
    tripLoadStatus = 'ready';
    openTrip = vi.fn();
    setCurrentTripId = vi.fn();
    searchParams = new URLSearchParams();
  });

  it('points currentTripId at the trip named by ?tripId= when landing fresh', () => {
    searchParams = new URLSearchParams('tripId=trip-1');
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(setCurrentTripId).toHaveBeenCalledWith('trip-1');
  });

  it('redirects home when the URL trip resolves to an empty trip', () => {
    searchParams = new URLSearchParams('tripId=trip-1');
    commandSnapshot = view({});
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('does not redirect a fresh trip reached with no URL tripId', () => {
    commandSnapshot = view({});
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('routes to the unified Plan Builder once a Guide turn generates a complete plan', async () => {
    commandSnapshot = view({ activeAgent: 'guide', plan: { places: [], day_plan: [], frozen: false, awaiting: 'anything_else' } });
    sendTripCommand = vi.fn(async () => ({ message: 'Here is your plan.', trip: view({ activeAgent: 'guide', plan: readyPlan() }) }));
    const user = userEvent.setup();
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText('Ask Scout a travel question…'), "That's everything{Enter}");
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/trip-preview'), { state: { guideMessage: 'Here is your plan.' } });
  });

  it.each(['meridian', 'guide', 'scout'])(
    'always sends traveler_message, regardless of active_agent (%s)',
    async agent => {
      commandSnapshot = view({ activeAgent: agent, context: { origin_city: 'Delhi' } });
      sendTripCommand = vi.fn(async () => ({ message: 'Got it.', trip: view({ activeAgent: agent }) }));
      const user = userEvent.setup();
      render(<MemoryRouter><ScoutChat /></MemoryRouter>);
      await user.type(screen.getByPlaceholderText('Ask Scout a travel question…'), 'Change of plans{Enter}');
      expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', expect.objectContaining({ message: 'Change of plans' }));
    }
  );

  it('shows the assistant reply in chat when Guide has not completed the plan', async () => {
    commandSnapshot = view({ activeAgent: 'guide', plan: { places: [], day_plan: [], frozen: false, awaiting: 'budget' } });
    sendTripCommand = vi.fn(async () => ({
      message: 'And roughly what budget?',
      trip: view({ activeAgent: 'guide', plan: { places: [], day_plan: [], frozen: false, awaiting: 'budget' } }),
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText('Ask Scout a travel question…'), 'Plan a Coorg trip{Enter}');
    expect(await screen.findByText('And roughly what budget?')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('ScoutChat refresh recap and hand-off note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandSnapshot = null;
    tripLoadStatus = 'ready';
    openTrip = vi.fn();
    searchParams = new URLSearchParams();
  });

  it('shows the cold-open greeting for a trip with no saved context yet', () => {
    commandSnapshot = view({});
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.getByText(/Hey there! I'm Scout/)).toBeInTheDocument();
  });

  it('shows a recap turn instead of the cold-open once real context is saved', () => {
    commandSnapshot = view({ context: { origin_city: 'Delhi', num_travelers: '2 people' } });
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Hey there! I'm Scout/)).not.toBeInTheDocument();
    expect(screen.getByText(/Picking up where you left off/)).toBeInTheDocument();
    expect(screen.getByText(/From Delhi/)).toBeInTheDocument();
  });

  it('waits for the trip to finish loading before deciding which greeting to show', () => {
    tripLoadStatus = 'loading';
    commandSnapshot = view({ context: { origin_city: 'Delhi' } });
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Hey there! I'm Scout/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Picking up where you left off/)).not.toBeInTheDocument();
  });

  it('shows the live facts panel for known context fields', () => {
    commandSnapshot = view({ context: { origin_city: 'Delhi', num_travelers: '2 people' } });
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.getByLabelText('What we know so far')).toBeInTheDocument();
    expect(screen.getByText('Delhi')).toBeInTheDocument();
  });

  it('shows the hand-off note once, on the real scout -> meridian transition', async () => {
    commandSnapshot = view({ activeAgent: 'scout', context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    const { rerender } = render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Bringing in Meridian/)).not.toBeInTheDocument();

    commandSnapshot = view({ activeAgent: 'meridian', context: { origin_city: 'Delhi' } });
    rerender(<MemoryRouter><ScoutChat /></MemoryRouter>);

    expect(await screen.findByText(/Bringing in Meridian, who handles destination matching/)).toBeInTheDocument();
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('shows no hand-off note when a trip loads already owned by meridian', () => {
    commandSnapshot = view({ activeAgent: 'meridian', context: { origin_city: 'Delhi' } });
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Bringing in Meridian/)).not.toBeInTheDocument();
  });

  it('shows a Guide-phrased recap turn when resuming a Guide-owned trip', () => {
    commandSnapshot = view({
      activeAgent: 'guide',
      context: { destinations: 'Coorg', origin_city: 'Delhi' },
      plan: { places: [], day_plan: [], frozen: false, awaiting: 'budget' },
    });
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Hey there! I'm Scout/)).not.toBeInTheDocument();
    expect(screen.getByText(/Picking up where you left off — planning Coorg/)).toBeInTheDocument();
    expect(screen.getByText(/I still need to know about budget/)).toBeInTheDocument();
  });

  it('shows the hand-off note once, on the real scout -> guide transition', async () => {
    commandSnapshot = view({ activeAgent: 'scout', context: { origin_city: 'Delhi' } });
    sendTripCommand = vi.fn();
    const { rerender } = render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Bringing in Guide/)).not.toBeInTheDocument();

    commandSnapshot = view({ activeAgent: 'guide', context: { origin_city: 'Delhi' } });
    rerender(<MemoryRouter><ScoutChat /></MemoryRouter>);

    expect(await screen.findByText(/Bringing in Guide, who builds your day-by-day plan/)).toBeInTheDocument();
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('shows no hand-off note when a trip loads already owned by guide', () => {
    commandSnapshot = view({ activeAgent: 'guide', context: { origin_city: 'Delhi' } });
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Bringing in Guide/)).not.toBeInTheDocument();
  });
});
