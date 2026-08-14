import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripPreview from '../../../src/pages/TripPreview.jsx';

const updateTrip = vi.fn();
const navigate = vi.fn();
let trip;
let commandSnapshot;
let sendTripCommand;
let tripLoadStatus;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ trip, updateTrip, commandSnapshot, sendTripCommand, tripLoadStatus }),
}));
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

function readyPlannerState(overrides = {}) {
  return {
    conversation_context: { awaiting: null },
    places: ['Triveni Ghat', 'Ram Jhula'],
    day_plan: [
      { day_number: 1, date: null, places: ['Triveni Ghat'], pace: 'relaxed', buffer_note: null },
      { day_number: 2, date: null, places: ['Ram Jhula'], pace: 'balanced', buffer_note: null },
    ],
    revision: 2,
    ...overrides,
  };
}

function snapshotWith(plannerState, tripContext = { destinations: ['Rishikesh'], trip_duration: 2 }) {
  return { version: 1, trip_state: { trip_context: tripContext, planner_state: plannerState } };
}

describe('TripPreview real Guide Plan Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trip = {};
    tripLoadStatus = 'ready';
  });

  it('bootstraps a fresh discover-path session with start_planning', async () => {
    commandSnapshot = snapshotWith(null);
    sendTripCommand = vi.fn(async command => {
      if (command === 'start_planning') {
        commandSnapshot = snapshotWith(readyPlannerState());
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Triveni Ghat')).toBeInTheDocument());
    expect(sendTripCommand).toHaveBeenCalledWith('start_planning');
    expect(screen.getAllByRole('button', { name: /Finalize my trip/ })).toHaveLength(1);
    expect(screen.queryByText(/Approve places|Approve itinerary/)).not.toBeInTheDocument();
  });

  it('does not re-call start_planning when the known-destination path already has a ready plan', () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(sendTripCommand).not.toHaveBeenCalled();
    expect(screen.getByText('Triveni Ghat')).toBeInTheDocument();
  });

  it('translates a place removal into a real traveler_message command', async () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn(async () => ({ message: 'Guide revised the plan.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Remove Triveni Ghat' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Remove "Triveni Ghat" from the plan.' });
  });

  it('translates a place replacement into a real traveler_message command', async () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn(async () => ({ message: 'Guide revised the plan.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Replace Triveni Ghat' }));
    await user.type(screen.getByRole('textbox', { name: 'Replace Triveni Ghat with' }), 'Ganga Aarti');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Replace "Triveni Ghat" with "Ganga Aarti".' });
  });

  it('translates a pace quick action into a real traveler_message command', async () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn(async () => ({ message: 'Guide revised the plan.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    const day1Actions = screen.getByRole('group', { name: 'Adjust Day 1 pace' });
    await user.click(within(day1Actions).getByRole('button', { name: 'Make packed' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Make Day 1 packed.' });
  });

  it('sends a chat drawer message as a real traveler_message command', async () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn(async () => ({ message: 'Noted.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Anything else to change/ }));
    await user.type(screen.getByRole('textbox', { name: 'Message Guide' }), 'Make it more adventurous');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Make it more adventurous' });
  });

  it('asks Guide\'s pending gating question instead of the day plan when there is no plan yet', () => {
    commandSnapshot = snapshotWith({ conversation_context: { awaiting: 'anything_else' }, places: [], day_plan: [], revision: 1 });
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(screen.getByText(/Guide needs a bit more/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finalize my trip/ })).not.toBeInTheDocument();
  });

  it('finalizes the plan on Finalize my trip', async () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn(async command => {
      if (command === 'approve_plan') {
        commandSnapshot = snapshotWith({
          ...readyPlannerState(),
          frozen_plan: { guide_revision: 3, guide_state: {} },
        });
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Finalize my trip/ }));
    expect(sendTripCommand).toHaveBeenCalledWith('approve_plan');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('skips straight to the Dashboard when the plan is already frozen (no re-invocation of Guide)', () => {
    commandSnapshot = snapshotWith({ ...readyPlannerState(), frozen_plan: { guide_revision: 1, guide_state: {} } });
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(sendTripCommand).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
