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
let openTrip;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ trip, updateTrip, commandSnapshot, sendTripCommand, tripLoadStatus, openTrip }),
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
    openTrip = vi.fn();
  });

  // TWM-185: a hard reload/bookmark on /trip-preview?tripId=... must resolve
  // that trip via a full fetch — commandSnapshot starts null, just like a
  // real reload with no prior openTrip call this session. Uses a snapshot
  // with no frozen plan and no planner_state so the boot-effect's own
  // start_planning guard doesn't fire and confuse this assertion.
  it('resolves the trip named by ?tripId= via openTrip when landing fresh', async () => {
    commandSnapshot = null;
    sendTripCommand = vi.fn();
    render(<MemoryRouter initialEntries={['/trip-preview?tripId=trip-1']}><TripPreview /></MemoryRouter>);
    await waitFor(() => expect(openTrip).toHaveBeenCalledWith('trip-1'));
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

  // TWM-188: a deep-link/stale-tab to a trip with no trip_context yet is an
  // orphan, not a real trip — must bounce home instead of booting Guide.
  it('redirects home when the URL trip resolves to an empty (no trip_context) trip', async () => {
    commandSnapshot = { version: 1, trip_state: { stage: 'new', trip_context: {} } };
    sendTripCommand = vi.fn();
    render(<MemoryRouter initialEntries={['/trip-preview?tripId=trip-1']}><TripPreview /></MemoryRouter>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('does not redirect a fresh trip reached with no URL tripId, even if empty', () => {
    commandSnapshot = { version: 1, trip_state: { stage: 'new', trip_context: {} } };
    sendTripCommand = vi.fn();
    render(<MemoryRouter initialEntries={['/trip-preview']}><TripPreview /></MemoryRouter>);
    expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
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

  // TWM-190: Guide already owns this trip but hasn't produced a day_plan yet
  // — that gating conversation now lives on ScoutChat.jsx, not a second
  // inline chat implementation here.
  it('redirects to /scout-chat instead of rendering a gating chat when there is an existing conversation but no plan yet', () => {
    commandSnapshot = snapshotWith({ conversation_context: { awaiting: 'anything_else' }, places: [], day_plan: [], revision: 1 }, {});
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(navigate).toHaveBeenCalledWith('/scout-chat', { replace: true });
    expect(sendTripCommand).not.toHaveBeenCalled();
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

  // TWM-190: start_planning can itself return a gating question instead of
  // a finished plan — redirects to ScoutChat rather than rendering the
  // retired inline gating branch.
  it('redirects to /scout-chat when start_planning itself returns a gating question, not a finished plan', async () => {
    commandSnapshot = snapshotWith(null);
    sendTripCommand = vi.fn(async () => {
      commandSnapshot = snapshotWith({ conversation_context: { awaiting: 'origin_city' }, places: [], day_plan: [], revision: 1 });
      return { message: 'Where will you be travelling from?', agent_meta: null, trip: commandSnapshot };
    });
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(sendTripCommand).toHaveBeenCalledWith('start_planning');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/scout-chat', { replace: true }));
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

    // TWM-188 item 3: matching -> /scout-chat, not /destinations — the
    // original navigation assumed /destinations for every reversal, which
    // was itself a stage/page mismatch (matching means a fresh Meridian
    // conversation, which lives on /scout-chat).
    it('shows the honest-transition screen while reversing, then navigates to /scout-chat once Guide reverses to Meridian directly (no prior recommendations)', async () => {
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
        trip: { trip_state: { active_agent: 'meridian', stage: 'matching', planner_state: null } },
      });
      await waitFor(() => expect(navigate).toHaveBeenCalledWith('/scout-chat'));
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
      expect(navigate).not.toHaveBeenCalledWith('/scout-chat');
    });

    // TWM-188 item 3: a trip with an existing recommendation list gets a
    // choice prompt instead of an immediate reversal.
    it('shows a revisit-vs-fresh choice, not the honest-transition screen, when the backend asks for one', async () => {
      commandSnapshot = snapshotWith(readyPlannerState());
      sendTripCommand = vi.fn(async () => ({
        message: 'You already have destination recommendations from earlier — want to revisit that list, or start a fresh search?',
        trip: {
          trip_state: {
            active_agent: 'guide',
            stage: 'planning',
            planner_state: { ...readyPlannerState(), conversation_context: { awaiting: 'destination_reopen_choice' } },
          },
        },
      }));
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));

      expect(await screen.findByText(/want to revisit that list, or start a fresh search/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Revisit my existing options' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start a fresh search' })).toBeInTheDocument();
      // The low-key reversal link is replaced by the choice while it's pending.
      expect(screen.queryByText(/Not the right destination\?/)).not.toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('sends reopen_destination_revisit and navigates to /destinations when the traveler picks revisit', async () => {
      commandSnapshot = snapshotWith(readyPlannerState());
      sendTripCommand = vi.fn()
        .mockResolvedValueOnce({
          message: 'Want to revisit that list, or start a fresh search?',
          trip: { trip_state: { active_agent: 'guide', planner_state: { conversation_context: { awaiting: 'destination_reopen_choice' } } } },
        })
        .mockResolvedValueOnce({
          message: 'Here are the destinations Meridian already found for you.',
          trip: { trip_state: { active_agent: null, stage: 'recommended' } },
        });
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));
      await user.click(await screen.findByRole('button', { name: 'Revisit my existing options' }));

      expect(sendTripCommand).toHaveBeenLastCalledWith('reopen_destination_revisit');
      await waitFor(() => expect(navigate).toHaveBeenCalledWith('/destinations'));
    });

    it('sends reopen_destination_fresh and navigates to /scout-chat when the traveler picks fresh discovery', async () => {
      commandSnapshot = snapshotWith(readyPlannerState());
      sendTripCommand = vi.fn()
        .mockResolvedValueOnce({
          message: 'Want to revisit that list, or start a fresh search?',
          trip: { trip_state: { active_agent: 'guide', planner_state: { conversation_context: { awaiting: 'destination_reopen_choice' } } } },
        })
        .mockResolvedValueOnce({
          message: null,
          trip: { trip_state: { active_agent: 'meridian', stage: 'matching' } },
        });
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));
      await user.click(await screen.findByRole('button', { name: 'Start a fresh search' }));

      expect(sendTripCommand).toHaveBeenLastCalledWith('reopen_destination_fresh');
      await waitFor(() => expect(navigate).toHaveBeenCalledWith('/scout-chat'));
    });
  });
});
