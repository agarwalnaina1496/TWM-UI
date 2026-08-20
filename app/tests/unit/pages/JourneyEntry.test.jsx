import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JourneyEntry from '../../../src/pages/JourneyEntry.jsx';

const navigate = vi.fn();
let commandSnapshot;
let sendTripCommand;
let startTrip;
let currentTripId;
let tripLoadStatus;
let openTrip;
let searchParams = new URLSearchParams();

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand, startTrip, currentTripId, tripLoadStatus, openTrip }),
}));
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
  useSearchParams: () => [searchParams],
}));

function readyPlannerState() {
  return {
    conversation_context: { awaiting: null },
    places: ['Triveni Ghat'],
    day_plan: [{ day_number: 1, date: null, places: ['Triveni Ghat'], pace: 'relaxed', buffer_note: null }],
    revision: 3,
  };
}

describe('JourneyEntry known-destination chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandSnapshot = null;
    startTrip = vi.fn();
    currentTripId = null;
    openTrip = vi.fn();
    searchParams = new URLSearchParams();
  });

  // TWM-185: a hard reload/bookmark on /journey-entry?tripId=... (resuming a
  // mid-conversation trip) must resolve that trip via a full fetch. The
  // normal fresh-entry path (startNewTrip() first, no ?tripId=) is
  // untouched — the hook simply no-ops when the param is absent.
  it('resolves the trip named by ?tripId= via openTrip when landing fresh', () => {
    searchParams = new URLSearchParams('intent=known_destination&tripId=trip-1');
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(openTrip).toHaveBeenCalledWith('trip-1');
  });

  it('does not call openTrip for a genuinely new trip (no ?tripId=)', () => {
    searchParams = new URLSearchParams('intent=known_destination');
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(openTrip).not.toHaveBeenCalled();
  });

  // TWM-183: the input's accessible label/placeholder must track the
  // active question across turns, not stay stuck on "Destination".
  it('binds the input label/placeholder to the active question across a multi-turn sequence', () => {
    commandSnapshot = null;
    const { rerender } = render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByRole('textbox', { name: 'Destination' })).toHaveAttribute('placeholder', 'e.g. Coorg, Karnataka');

    commandSnapshot = { trip_state: { planner_state: { conversation_context: { awaiting: 'origin_city' }, places: [], day_plan: [] } } };
    rerender(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByRole('textbox', { name: 'Starting location' })).toHaveAttribute('placeholder', 'e.g. Delhi');

    commandSnapshot = { trip_state: { planner_state: { conversation_context: { awaiting: 'budget' }, places: [], day_plan: [] } } };
    rerender(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByRole('textbox', { name: 'Budget' })).toHaveAttribute('placeholder', 'e.g. ₹1,00,000 total for both');
  });

  // TWM-183: submitDestination optimistically clears the input state before
  // awaiting the network response — "Try again" must resend the value that
  // was actually submitted, not the now-cleared input (which used to make
  // its own `if (!value...) return;` guard silently no-op).
  it('"Try again" resends the last submitted value after a failure, not the cleared input', async () => {
    commandSnapshot = null;
    // TWM-189: a genuinely new trip's first send goes through startTrip(),
    // not sendTripCommand() — no bare create happens before it, so a
    // failure here leaves no trip at all and "Try again" simply retries
    // the same startTrip() call.
    startTrip = vi.fn()
      .mockRejectedValueOnce(new Error('The request timed out. Please try again.'))
      .mockResolvedValueOnce({ message: 'Got it.', trip: { trip_state: { planner_state: { conversation_context: { awaiting: 'origin_city' }, places: [], day_plan: [] } } } });
    const user = userEvent.setup();
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);

    await user.type(screen.getByRole('textbox', { name: 'Destination' }), 'Goa{Enter}');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(startTrip).toHaveBeenCalledTimes(2);
    expect(startTrip).toHaveBeenNthCalledWith(2, 'known_destination_entry', { destination: 'Goa' });
  });

  it('asks the sixth "anything else" question once the five fixed fields are answered', () => {
    commandSnapshot = {
      trip_state: {
        planner_state: { conversation_context: { awaiting: 'anything_else' }, places: [], day_plan: [] },
      },
    };
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByRole('button', { name: "Nothing else, let's plan" })).toBeInTheDocument();
  });

  it('routes straight to the unified Plan Builder once Guide generates places and a day plan together, never /dashboard', async () => {
    commandSnapshot = { trip_state: { planner_state: { conversation_context: { awaiting: 'anything_else' }, places: [], day_plan: [] } } };
    // Already at the gate's final question implies the trip and its earlier
    // turns already exist — this send is a traveler_message, not a first
    // send, so a trip id must already be current.
    currentTripId = 'trip-1';
    sendTripCommand = vi.fn(async () => ({
      message: 'Here is your plan.',
      trip: { trip_state: { planner_state: readyPlannerState() } },
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    // TWM-183: awaiting is 'anything_else' here, so the input's accessible
    // label correctly tracks that question now, not a stuck "Destination".
    const input = screen.getByRole('textbox', { name: 'Anything else to add' });
    await user.type(input, "Nothing else, let's plan");
    await user.click(screen.getByRole('button', { name: 'Start planning' }));
    expect(navigate).toHaveBeenCalledWith('/trip-preview', { state: { guideMessage: 'Here is your plan.' } });
    expect(navigate).not.toHaveBeenCalledWith('/dashboard');
  });
});

describe('JourneyEntry Discover refresh recap and facts panel (TWM-173)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandSnapshot = null;
    startTrip = vi.fn();
    currentTripId = null;
    tripLoadStatus = 'ready';
    searchParams = new URLSearchParams('intent=discover_destination');
  });

  it('shows the cold-open greeting for a fresh Discover session with no saved context', () => {
    commandSnapshot = { trip_state: {} };
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByText(/Hey there! I'm Scout/)).toBeInTheDocument();
    expect(screen.getByText('To start, where will you be traveling from?')).toBeInTheDocument();
  });

  it('shows a recap turn instead of the cold-open greeting after a refresh mid-conversation', () => {
    commandSnapshot = { trip_state: { trip_context: { origin: 'Delhi' } } };
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.queryByText(/Hey there! I'm Scout/)).not.toBeInTheDocument();
    expect(screen.getByText(/Picking up where you left off/)).toBeInTheDocument();
  });

  it('shows the live facts panel for known trip_context fields', () => {
    commandSnapshot = { trip_state: { trip_context: { origin: 'Delhi', travelers: 2 } } };
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByLabelText('What we know so far')).toBeInTheDocument();
  });
});
