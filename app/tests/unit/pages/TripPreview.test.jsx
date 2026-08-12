import { render, screen, waitFor } from '@testing-library/react';
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

function guideState(overrides = {}) {
  return {
    phase: 'DAY_PLAN_DRAFT',
    destinations: ['Rishikesh'],
    duration_days: 2,
    start_date: null,
    places: ['Triveni Ghat', 'Ram Jhula'],
    day_plan: [
      { day_number: 1, date: null, places: ['Triveni Ghat'] },
      { day_number: 2, date: null, places: ['Ram Jhula'] },
    ],
    preferences: [],
    exclusions: [],
    applied_changes: [],
    pending_clarification: null,
    ...overrides,
  };
}

function snapshotWith(plannerState) {
  return { version: 1, trip_state: { trip_context: {}, planner_state: plannerState } };
}

describe('TripPreview real Guide Plan Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trip = {};
    tripLoadStatus = 'ready';
  });

  it('bootstraps a fresh session with start_planning then a silent approve_places', async () => {
    commandSnapshot = snapshotWith({});
    sendTripCommand = vi.fn(async command => {
      if (command === 'start_planning') {
        commandSnapshot = snapshotWith({ guide_session: { revision: 1, state: guideState({ phase: 'PLACES_DRAFT', day_plan: [] }) } });
      } else if (command === 'approve_places') {
        commandSnapshot = snapshotWith({ guide_session: { revision: 2, state: guideState() } });
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Triveni Ghat')).toBeInTheDocument());
    expect(sendTripCommand).toHaveBeenNthCalledWith(1, 'start_planning');
    expect(sendTripCommand).toHaveBeenNthCalledWith(2, 'approve_places');
    expect(screen.getAllByRole('button', { name: /Generate detailed itinerary/ })).toHaveLength(1);
    expect(screen.queryByText(/Approve places|Approve itinerary/)).not.toBeInTheDocument();
  });

  it('translates a place removal into a real traveler_message command', async () => {
    commandSnapshot = snapshotWith({ guide_session: { revision: 2, state: guideState() } });
    sendTripCommand = vi.fn(async () => ({ message: 'Guide revised the plan.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Remove Triveni Ghat' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Remove "Triveni Ghat" from Day 1.' });
  });

  it('sends the conversational undo request', async () => {
    commandSnapshot = snapshotWith({ guide_session: { revision: 2, state: guideState() } });
    sendTripCommand = vi.fn(async () => ({ message: null, agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Undo last change' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Undo my last change and restore the previous version of the plan.' });
  });

  it('shows a Guide clarification question instead of the day plan when Guide asks one', () => {
    commandSnapshot = snapshotWith({ guide_session: { revision: 2, state: guideState({ phase: 'NEEDS_CLARIFICATION', day_plan: [], pending_clarification: 'How many travelers?' }) } });
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(screen.getByText(/Guide needs to know: How many travelers\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate detailed itinerary/ })).toBeDisabled();
  });

  it('approves the plan on Generate detailed itinerary', async () => {
    commandSnapshot = snapshotWith({ guide_session: { revision: 2, state: guideState() } });
    sendTripCommand = vi.fn(async command => {
      if (command === 'approve_plan') {
        const frozen = guideState({ phase: 'PLAN_APPROVED' });
        commandSnapshot = snapshotWith({
          guide_session: { revision: 3, state: frozen },
          frozen_plan: { guide_revision: 3, guide_state: frozen },
        });
      }
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Generate detailed itinerary/ }));
    expect(sendTripCommand).toHaveBeenCalledWith('approve_plan');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('skips straight to the Dashboard when the plan is already frozen (no re-invocation of Guide)', () => {
    commandSnapshot = snapshotWith({ frozen_plan: { guide_revision: 1, guide_state: guideState({ phase: 'PLAN_APPROVED' }) } });
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(sendTripCommand).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
