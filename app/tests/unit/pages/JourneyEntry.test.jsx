import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JourneyEntry from '../../../src/pages/JourneyEntry.jsx';

const navigate = vi.fn();
let commandSnapshot;
let sendTripCommand;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand }),
}));
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams()],
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
    sendTripCommand = vi.fn(async () => ({
      message: 'Here is your plan.',
      trip: { trip_state: { planner_state: readyPlannerState() } },
    }));
    const user = userEvent.setup();
    render(<MemoryRouter><JourneyEntry /></MemoryRouter>);
    const input = screen.getByRole('textbox', { name: 'Destination' });
    await user.type(input, "Nothing else, let's plan");
    await user.click(screen.getByRole('button', { name: 'Start planning' }));
    expect(navigate).toHaveBeenCalledWith('/trip-preview');
    expect(navigate).not.toHaveBeenCalledWith('/dashboard');
  });
});
