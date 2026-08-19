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
let searchParams = new URLSearchParams();

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand, tripLoadStatus, openTrip }),
}));
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
  useSearchParams: () => [searchParams],
}));

function readyPlannerState() {
  return {
    conversation_context: { awaiting: null },
    places: ['Abbey Falls'],
    day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null }],
    revision: 3,
  };
}

describe('ScoutChat advice-entry chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandSnapshot = null;
    tripLoadStatus = 'ready';
    openTrip = vi.fn();
    searchParams = new URLSearchParams();
  });

  // TWM-185: a hard reload/bookmark on /scout-chat?tripId=... must resolve
  // that trip via a full fetch — commandSnapshot starts null, just like a
  // real reload with no prior openTrip call this session.
  it('resolves the trip named by ?tripId= via openTrip when landing fresh', async () => {
    searchParams = new URLSearchParams('tripId=trip-1');
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(openTrip).toHaveBeenCalledWith('trip-1');
  });

  it('routes to the unified Plan Builder once a Guide-owned turn generates a complete plan, without throwing', async () => {
    commandSnapshot = { trip_state: { active_agent: 'guide', planner_state: { conversation_context: { awaiting: 'anything_else' }, places: [], day_plan: [] } } };
    sendTripCommand = vi.fn(async () => ({
      message: 'Here is your plan.',
      trip: { trip_state: { active_agent: 'guide', planner_state: readyPlannerState() } },
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    const input = screen.getByPlaceholderText('Ask Scout a travel question…');
    await user.type(input, "That's everything{Enter}");
    expect(navigate).toHaveBeenCalledWith('/trip-preview', { state: { guideMessage: 'Here is your plan.' } });
  });

  it('shows the assistant reply in chat when Guide has not yet completed the plan', async () => {
    commandSnapshot = { trip_state: { active_agent: 'guide', planner_state: { conversation_context: { awaiting: 'budget' }, places: [], day_plan: [] } } };
    sendTripCommand = vi.fn(async () => ({
      message: 'And roughly what budget?',
      trip: { trip_state: { active_agent: 'guide', planner_state: { conversation_context: { awaiting: 'budget' }, places: [], day_plan: [] } } },
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    const input = screen.getByPlaceholderText('Ask Scout a travel question…');
    await user.type(input, 'Plan a Coorg trip{Enter}');
    expect(await screen.findByText('And roughly what budget?')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('ScoutChat refresh recap and hand-off note (TWM-173)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandSnapshot = null;
    tripLoadStatus = 'ready';
    openTrip = vi.fn();
    searchParams = new URLSearchParams();
  });

  it('shows the cold-open greeting for a trip with no saved context yet', () => {
    commandSnapshot = { trip_state: {} };
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.getByText(/Hey there! I'm Scout/)).toBeInTheDocument();
  });

  it('shows a recap turn instead of the cold-open greeting once real trip_context is already saved', () => {
    commandSnapshot = { trip_state: { trip_context: { origin: 'Delhi', travelers: 2 } } };
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Hey there! I'm Scout/)).not.toBeInTheDocument();
    expect(screen.getByText(/Picking up where you left off/)).toBeInTheDocument();
    expect(screen.getByText(/From Delhi/)).toBeInTheDocument();
  });

  it('waits for the trip to finish loading before deciding which greeting to show', () => {
    tripLoadStatus = 'loading';
    commandSnapshot = { trip_state: { trip_context: { origin: 'Delhi' } } };
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Hey there! I'm Scout/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Picking up where you left off/)).not.toBeInTheDocument();
  });

  it('shows the live facts panel for known trip_context fields', () => {
    commandSnapshot = { trip_state: { trip_context: { origin: 'Delhi', travelers: 2 } } };
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.getByLabelText('What we know so far')).toBeInTheDocument();
    expect(screen.getByText('Delhi')).toBeInTheDocument();
  });

  it('shows the hand-off note exactly once, on the real scout -> meridian transition', async () => {
    commandSnapshot = { trip_state: { active_agent: 'scout', trip_context: { origin: 'Delhi' } } };
    sendTripCommand = vi.fn(async () => ({
      message: 'Here are some matches.',
      trip: { trip_state: { active_agent: 'meridian', planner_state: null } },
    }));
    const { rerender } = render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Bringing in Meridian/)).not.toBeInTheDocument();

    // Simulate the trip snapshot updating to meridian ownership after a turn.
    commandSnapshot = { trip_state: { active_agent: 'meridian', trip_context: { origin: 'Delhi' } } };
    rerender(<MemoryRouter><ScoutChat /></MemoryRouter>);

    expect(await screen.findByText(/Bringing in Meridian, who handles destination matching/)).toBeInTheDocument();
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('shows no hand-off note when a trip loads already owned by meridian', () => {
    commandSnapshot = { trip_state: { active_agent: 'meridian', trip_context: { origin: 'Delhi' } } };
    render(<MemoryRouter><ScoutChat /></MemoryRouter>);
    expect(screen.queryByText(/Bringing in Meridian/)).not.toBeInTheDocument();
  });
});
