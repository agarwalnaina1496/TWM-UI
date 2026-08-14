import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScoutChat from '../../../src/pages/ScoutChat.jsx';

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
    places: ['Abbey Falls'],
    day_plan: [{ day_number: 1, date: null, places: ['Abbey Falls'], pace: 'relaxed', buffer_note: null }],
    revision: 3,
  };
}

describe('ScoutChat advice-entry chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandSnapshot = null;
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
