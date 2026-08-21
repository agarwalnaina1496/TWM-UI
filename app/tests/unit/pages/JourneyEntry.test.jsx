import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JourneyEntry from '../../../src/pages/JourneyEntry.jsx';

const navigate = vi.fn();
let startTrip;
let currentTripId;
let tripLoadStatus;
let openTrip;
let searchParams = new URLSearchParams();

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ startTrip, currentTripId, tripLoadStatus, openTrip }),
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
    revision: 1,
  };
}

// TWM-190: JourneyEntry.jsx now only owns the traveler's first message —
// everything after that lives on ScoutChat.jsx. These tests replace the
// old inline-chat coverage with the new send-then-redirect behavior.
describe('JourneyEntry first-message entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startTrip = vi.fn();
    currentTripId = null;
    tripLoadStatus = 'ready';
    openTrip = vi.fn();
    searchParams = new URLSearchParams('intent=known_destination');
  });

  it('resolves the trip named by ?tripId= via openTrip when landing on a resumed URL', () => {
    searchParams = new URLSearchParams('intent=known_destination&tripId=trip-1');
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(openTrip).toHaveBeenCalledWith('trip-1');
  });

  it('does not call openTrip for a genuinely new trip (no ?tripId=)', () => {
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(openTrip).not.toHaveBeenCalled();
  });

  it('redirects straight to /scout-chat when a trip already exists for this URL', () => {
    searchParams = new URLSearchParams('intent=known_destination&tripId=trip-1');
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(navigate).toHaveBeenCalledWith('/scout-chat?tripId=trip-1', { replace: true });
    expect(startTrip).not.toHaveBeenCalled();
  });

  it('redirects straight to /scout-chat when currentTripId is already set (same-session re-render)', () => {
    currentTripId = 'trip-2';
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(navigate).toHaveBeenCalledWith('/scout-chat?tripId=trip-2', { replace: true });
  });

  it('does not redirect a genuinely fresh entry (no tripId anywhere)', () => {
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renders the known-destination "Trip setup" framing, Discover renders "✦ Scout"', () => {
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByText('Trip setup')).toBeInTheDocument();

    searchParams = new URLSearchParams('intent=discover_destination');
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    expect(screen.getByText('✦ Scout')).toBeInTheDocument();
  });

  it('known-destination: sends known_destination_entry and redirects to /scout-chat carrying the exchange forward', async () => {
    startTrip = vi.fn(async () => ({
      message: 'Great — how many travelers?',
      trip: { id: 'trip-1', trip_state: { planner_state: { conversation_context: { awaiting: 'num_travelers' }, places: [], day_plan: [] } } },
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    await user.type(screen.getByRole('textbox', { name: 'Destination' }), 'Goa{Enter}');

    expect(startTrip).toHaveBeenCalledWith('known_destination_entry', { destination: 'Goa' });
    expect(navigate).toHaveBeenCalledWith('/scout-chat?tripId=trip-1', {
      state: { firstTurn: { userMessage: 'Goa', responseMessage: 'Great — how many travelers?' } },
    });
  });

  it('discover: sends discover_entry and redirects to /scout-chat carrying the exchange forward', async () => {
    searchParams = new URLSearchParams('intent=discover_destination');
    startTrip = vi.fn(async () => ({
      message: 'To start, where will you be traveling from?',
      trip: { id: 'trip-1', trip_state: { trip_context: {} } },
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    await user.type(screen.getByRole('textbox', { name: 'Message Scout' }), 'Somewhere relaxing{Enter}');

    expect(startTrip).toHaveBeenCalledWith('discover_entry', { message: 'Somewhere relaxing' });
    expect(navigate).toHaveBeenCalledWith('/scout-chat?tripId=trip-1', {
      state: { firstTurn: { userMessage: 'Somewhere relaxing', responseMessage: 'To start, where will you be traveling from?' } },
    });
  });

  it('routes straight to the unified Plan Builder, never ScoutChat, when Guide generates the plan on this very first turn', async () => {
    startTrip = vi.fn(async () => ({
      message: 'Here is your plan.',
      trip: { id: 'trip-1', trip_state: { planner_state: readyPlannerState() } },
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    await user.type(screen.getByRole('textbox', { name: 'Destination' }), 'Goa{Enter}');

    expect(navigate).toHaveBeenCalledWith('/trip-preview?tripId=trip-1', { state: { guideMessage: 'Here is your plan.' } });
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining('/scout-chat'), expect.anything());
  });

  // TWM-183 (carried over): submit optimistically clears the input before
  // awaiting the response — "Try again" must resend the value that was
  // actually submitted, not the now-cleared input.
  it('"Try again" resends the last submitted value after a failure', async () => {
    startTrip = vi.fn()
      .mockRejectedValueOnce(new Error('The request timed out. Please try again.'))
      .mockResolvedValueOnce({ message: 'Got it.', trip: { id: 'trip-1', trip_state: { planner_state: { conversation_context: { awaiting: 'origin_city' }, places: [], day_plan: [] } } } });
    const user = userEvent.setup();
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);

    await user.type(screen.getByRole('textbox', { name: 'Destination' }), 'Goa{Enter}');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(startTrip).toHaveBeenCalledTimes(2);
    expect(startTrip).toHaveBeenNthCalledWith(2, 'known_destination_entry', { destination: 'Goa' });
  });
});
