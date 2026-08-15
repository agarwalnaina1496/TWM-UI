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
    expect(screen.getAllByRole('button', { name: /Approve this plan/ })).toHaveLength(1);
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
    // No saved trip_context — a genuinely fresh gating conversation, not a
    // refresh — so the generic filler shows, not a recap turn.
    commandSnapshot = snapshotWith({ conversation_context: { awaiting: 'anything_else' }, places: [], day_plan: [], revision: 1 }, {});
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(screen.getByText(/Guide needs a bit more/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve this plan/ })).not.toBeInTheDocument();
  });

  // TWM-174: Plan chat's refresh-recap variant, mirroring Discover's
  // pattern — a refresh mid-gating-conversation must not read as a blank
  // slate. No BackToTrip on this screen, matching Discover's entry-chat.
  it('shows a recap turn instead of generic filler when trip_context already exists (refresh mid-conversation)', () => {
    commandSnapshot = snapshotWith({ conversation_context: { awaiting: 'anything_else' }, places: [], day_plan: [], revision: 1 });
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(screen.getAllByText(/Picking up where you left off/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rishikesh/).length).toBeGreaterThan(0);
    expect(screen.queryByText('← Back to trip')).not.toBeInTheDocument();
  });

  it('finalizes the plan on Approve this plan', async () => {
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
    await user.click(screen.getByRole('button', { name: /Approve this plan/ }));
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

  it('shows Guide\'s message carried over via navigation state from the chat turn that completed the plan', () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn();
    render(
      <MemoryRouter initialEntries={[{ pathname: '/trip-preview', state: { guideMessage: 'Here is your three-day plan.' } }]}>
        <TripPreview />
      </MemoryRouter>
    );
    expect(screen.getByText('Here is your three-day plan.')).toBeInTheDocument();
  });

  it('shows Guide\'s actual gating question from the start_planning response, not generic filler text', async () => {
    commandSnapshot = snapshotWith(null);
    sendTripCommand = vi.fn(async () => {
      commandSnapshot = snapshotWith({ conversation_context: { awaiting: 'origin_city' }, places: [], day_plan: [], revision: 1 });
      return { message: 'Where will you be travelling from?', agent_meta: null, trip: commandSnapshot };
    });
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(await screen.findAllByText('Where will you be travelling from?')).toHaveLength(2);
  });

  it('scopes the Replace-in-progress row to a single day, not every day sharing the same place name', async () => {
    commandSnapshot = snapshotWith(readyPlannerState({
      places: ['Lunch', 'Lunch'],
      day_plan: [
        { day_number: 1, date: null, places: ['Lunch'], pace: 'relaxed', buffer_note: null },
        { day_number: 2, date: null, places: ['Lunch'], pace: 'balanced', buffer_note: null },
      ],
    }));
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    const day1Actions = screen.getByRole('group', { name: 'Adjust Day 1 pace' });
    const day1Row = day1Actions.closest('.day-card');
    await user.click(within(day1Row).getByRole('button', { name: 'Replace Lunch' }));
    // Day 1's row is now in edit mode...
    expect(within(day1Row).getByRole('textbox', { name: 'Replace Lunch with' })).toBeInTheDocument();
    // ...but Day 2's identically-named row must still show its plain Replace/Remove actions.
    const day2Actions = screen.getByRole('group', { name: 'Adjust Day 2 pace' });
    const day2Row = day2Actions.closest('.day-card');
    expect(within(day2Row).getByRole('button', { name: 'Replace Lunch' })).toBeInTheDocument();
    expect(within(day2Row).queryByRole('textbox', { name: 'Replace Lunch with' })).not.toBeInTheDocument();
  });

  it('shows pace as a density meter and places as a numbered sequence', () => {
    commandSnapshot = snapshotWith(readyPlannerState());
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(screen.getByRole('img', { name: 'Pace: relaxed' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pace: balanced' })).toBeInTheDocument();
    expect(screen.getByText('Triveni Ghat').closest('.place-name')).toHaveTextContent('1');
    expect(screen.getByText('Ram Jhula').closest('.place-name')).toHaveTextContent('1'); // day 2's own place #1
  });

  describe('reopen_destination_discovery reversal link (TWM-174)', () => {
    it('is present on the ready Plan Builder, low-key styled as a link not a button', () => {
      commandSnapshot = snapshotWith(readyPlannerState());
      sendTripCommand = vi.fn();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      const link = screen.getByText(/Not the right destination\?/);
      expect(link).toHaveClass('link-button');
    });

    it('shows the honest-transition screen while reversing, then navigates to Destinations once Guide reverses to Meridian', async () => {
      commandSnapshot = snapshotWith(readyPlannerState());
      let resolveCommand;
      sendTripCommand = vi.fn(() => new Promise(resolve => { resolveCommand = resolve; }));
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));

      expect(screen.getByRole('status', { name: 'Finding new matches' })).toBeInTheDocument();
      expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: expect.stringContaining('change my destination') });

      resolveCommand({
        message: "Let's look at other destinations.",
        trip: { trip_state: { active_agent: 'meridian', stage: 'matching' } },
      });
      await waitFor(() => expect(navigate).toHaveBeenCalledWith('/destinations'));
    });

    it('shows Guide\'s clarifying question inline, without navigating, when Guide treats the request as ambiguous', async () => {
      commandSnapshot = snapshotWith(readyPlannerState());
      sendTripCommand = vi.fn(async () => ({
        message: 'Do you want to adjust this trip, or pick a different destination?',
        trip: { trip_state: { active_agent: 'guide', planner_state: readyPlannerState() } },
      }));
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));

      expect(await screen.findByText('Do you want to adjust this trip, or pick a different destination?')).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalledWith('/destinations');
    });
  });
});
