import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripPreview from '../../../src/pages/TripPreview.jsx';

const navigate = vi.fn();
let commandSnapshot;
let sendTripCommand;
let tripLoadStatus;
let openTrip;
let setCurrentTripId;

vi.mock('../../../src/context/TripContext.jsx', () => ({
  useTrip: () => ({ commandSnapshot, sendTripCommand, tripLoadStatus, currentTripId: commandSnapshot?.id ?? null, setCurrentTripId, prefetchTrip: openTrip }),
}));
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

// TWM-220: commandSnapshot / command responses' `trip` are `TripView`s.
function recap(entries) {
  return Object.entries(entries).map(([key, value]) => ({ key, label: key, value }));
}
function readyPlan(overrides = {}) {
  return {
    places: ['Triveni Ghat', 'Ram Jhula'],
    day_plan: [
      { day_number: 1, places: ['Triveni Ghat'], pace: 'relaxed', buffer_note: null },
      { day_number: 2, places: ['Ram Jhula'], pace: 'balanced', buffer_note: null },
    ],
    frozen: false,
    awaiting: null,
    ...overrides,
  };
}
function view(plan, context = { destinations: 'Rishikesh', trip_duration: '2' }, { stage = 'planning', activeAgent = 'guide', selectedOption = null } = {}) {
  return {
    id: 'trip-1', version: 1, title: 'T',
    lifecycle: { stage, status: 'free', active_agent: activeAgent, selected_option: selectedOption },
    context_recap: recap(context),
    plan,
    matcher: { last_message: null, awaiting: null, has_recommendation: false },
    summary: null,
  };
}

describe('TripPreview real Guide Plan Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tripLoadStatus = 'ready';
    openTrip = vi.fn();
    setCurrentTripId = vi.fn();
  });

  it('points currentTripId at the trip named by ?tripId= when landing fresh', async () => {
    commandSnapshot = null;
    sendTripCommand = vi.fn();
    render(<MemoryRouter initialEntries={['/trip-preview?tripId=trip-1']}><TripPreview /></MemoryRouter>);
    await waitFor(() => expect(setCurrentTripId).toHaveBeenCalledWith('trip-1'));
  });

  it('bootstraps a fresh discover-path session with start_planning', async () => {
    commandSnapshot = view(null);
    sendTripCommand = vi.fn(async command => {
      if (command === 'start_planning') commandSnapshot = view(readyPlan());
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Triveni Ghat')).toBeInTheDocument());
    expect(sendTripCommand).toHaveBeenCalledWith('start_planning');
    expect(screen.getAllByRole('button', { name: /Approve this plan/ })).toHaveLength(1);
  });

  it('redirects home when the URL trip resolves to an empty trip', async () => {
    commandSnapshot = view(null, {}, { stage: 'new', activeAgent: null });
    sendTripCommand = vi.fn();
    render(<MemoryRouter initialEntries={['/trip-preview?tripId=trip-1']}><TripPreview /></MemoryRouter>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('does not redirect a fresh trip reached with no URL tripId', () => {
    commandSnapshot = view(null, {}, { stage: 'new', activeAgent: null });
    sendTripCommand = vi.fn();
    render(<MemoryRouter initialEntries={['/trip-preview']}><TripPreview /></MemoryRouter>);
    expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('does not re-call start_planning when a ready plan already exists', () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(sendTripCommand).not.toHaveBeenCalled();
    expect(screen.getByText('Triveni Ghat')).toBeInTheDocument();
  });

  it('translates a place removal into a real traveler_message command', async () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn(async () => ({ message: 'Guide revised the plan.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Remove Triveni Ghat' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Remove "Triveni Ghat" from the plan.' });
  });

  it('translates a place replacement into a real traveler_message command', async () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn(async () => ({ message: 'Guide revised the plan.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Replace Triveni Ghat' }));
    await user.type(screen.getByRole('textbox', { name: 'Replace Triveni Ghat with' }), 'Ganga Aarti');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Replace "Triveni Ghat" with "Ganga Aarti".' });
  });

  it('translates a pace quick action into a real traveler_message command', async () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn(async () => ({ message: 'Guide revised the plan.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    const day1Actions = screen.getByRole('group', { name: 'Adjust Day 1 pace' });
    await user.click(within(day1Actions).getByRole('button', { name: 'Make packed' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Make Day 1 packed.' });
  });

  it('sends a chat drawer message as a real traveler_message command', async () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn(async () => ({ message: 'Noted.', agent_meta: null, trip: commandSnapshot }));
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Anything else to change/ }));
    await user.type(screen.getByRole('textbox', { name: 'Message Guide' }), 'Make it more adventurous');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: 'Make it more adventurous' });
  });

  it('redirects to /scout-chat when there is an existing conversation but no plan yet', () => {
    commandSnapshot = view({ places: [], day_plan: [], frozen: false, awaiting: 'anything_else' }, {});
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/scout-chat'), { replace: true });
    expect(sendTripCommand).not.toHaveBeenCalled();
  });

  it('finalizes the plan on Approve this plan', async () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn(async command => {
      if (command === 'approve_plan') commandSnapshot = view(readyPlan({ frozen: true }), undefined, { stage: 'planned', activeAgent: null });
      return { message: null, agent_meta: null, trip: commandSnapshot };
    });
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Approve this plan/ }));
    expect(sendTripCommand).toHaveBeenCalledWith('approve_plan');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/dashboard'), { replace: true }));
  });

  it('skips straight to the Dashboard when the plan is already frozen', () => {
    commandSnapshot = view(readyPlan({ frozen: true }), undefined, { stage: 'planned', activeAgent: null });
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(sendTripCommand).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/dashboard'), { replace: true });
  });

  it("shows Guide's message carried over via navigation state", () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn();
    render(
      <MemoryRouter initialEntries={[{ pathname: '/trip-preview', state: { guideMessage: 'Here is your three-day plan.' } }]}>
        <TripPreview />
      </MemoryRouter>
    );
    expect(screen.getByText('Here is your three-day plan.')).toBeInTheDocument();
  });

  it('redirects to /scout-chat when start_planning returns a gating question', async () => {
    commandSnapshot = view(null);
    sendTripCommand = vi.fn(async () => {
      commandSnapshot = view({ places: [], day_plan: [], frozen: false, awaiting: 'origin_city' });
      return { message: 'Where from?', agent_meta: null, trip: commandSnapshot };
    });
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(sendTripCommand).toHaveBeenCalledWith('start_planning');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/scout-chat'), { replace: true }));
  });

  it('scopes the Replace-in-progress row to a single day', async () => {
    commandSnapshot = view(readyPlan({
      places: ['Lunch', 'Lunch'],
      day_plan: [
        { day_number: 1, places: ['Lunch'], pace: 'relaxed', buffer_note: null },
        { day_number: 2, places: ['Lunch'], pace: 'balanced', buffer_note: null },
      ],
    }));
    sendTripCommand = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    const day1Row = screen.getByRole('group', { name: 'Adjust Day 1 pace' }).closest('.day-card');
    await user.click(within(day1Row).getByRole('button', { name: 'Replace Lunch' }));
    expect(within(day1Row).getByRole('textbox', { name: 'Replace Lunch with' })).toBeInTheDocument();
    const day2Row = screen.getByRole('group', { name: 'Adjust Day 2 pace' }).closest('.day-card');
    expect(within(day2Row).getByRole('button', { name: 'Replace Lunch' })).toBeInTheDocument();
    expect(within(day2Row).queryByRole('textbox', { name: 'Replace Lunch with' })).not.toBeInTheDocument();
  });

  it('shows pace as a density meter and places as a numbered sequence', () => {
    commandSnapshot = view(readyPlan());
    sendTripCommand = vi.fn();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(screen.getByRole('img', { name: 'Pace: relaxed' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pace: balanced' })).toBeInTheDocument();
    expect(screen.getByText('Triveni Ghat').closest('.place-name')).toHaveTextContent('1');
  });

  describe('reopen_destination_discovery reversal link', () => {
    it('is present on the ready Plan Builder, styled as a link', () => {
      commandSnapshot = view(readyPlan());
      sendTripCommand = vi.fn();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      expect(screen.getByText(/Not the right destination\?/)).toHaveClass('link-button');
    });

    it('navigates to /scout-chat once Guide reverses to Meridian directly', async () => {
      commandSnapshot = view(readyPlan());
      let resolveCommand;
      sendTripCommand = vi.fn(() => new Promise(resolve => { resolveCommand = resolve; }));
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));

      expect(screen.getByRole('status', { name: 'Finding new matches' })).toBeInTheDocument();
      expect(sendTripCommand).toHaveBeenCalledWith('traveler_message', { message: expect.stringContaining('change my destination') });

      resolveCommand({ message: "Let's look at other destinations.", trip: view(null, undefined, { stage: 'matching', activeAgent: 'meridian' }) });
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/scout-chat')));
    });

    it("shows Guide's clarifying question inline, without navigating", async () => {
      commandSnapshot = view(readyPlan());
      sendTripCommand = vi.fn(async () => ({
        message: 'Adjust this trip, or pick a different destination?',
        trip: view(readyPlan()),
      }));
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));
      expect(await screen.findByText('Adjust this trip, or pick a different destination?')).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalledWith('/destinations');
    });

    it('shows a revisit-vs-fresh choice when the backend asks for one', async () => {
      commandSnapshot = view(readyPlan());
      sendTripCommand = vi.fn(async () => ({
        message: 'Revisit that list, or start a fresh search?',
        trip: view(readyPlan({ awaiting: 'destination_reopen_choice' })),
      }));
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));

      expect(await screen.findByText(/Revisit that list, or start a fresh search/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Revisit my existing options' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start a fresh search' })).toBeInTheDocument();
      expect(screen.queryByText(/Not the right destination\?/)).not.toBeInTheDocument();
    });

    it('sends reopen_destination_revisit and navigates to /destinations', async () => {
      commandSnapshot = view(readyPlan());
      sendTripCommand = vi.fn()
        .mockResolvedValueOnce({ message: 'Revisit or fresh?', trip: view(readyPlan({ awaiting: 'destination_reopen_choice' })) })
        .mockResolvedValueOnce({ message: 'Here are the destinations.', trip: view(null, undefined, { stage: 'recommended', activeAgent: null }) });
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));
      await user.click(await screen.findByRole('button', { name: 'Revisit my existing options' }));

      expect(sendTripCommand).toHaveBeenLastCalledWith('reopen_destination_revisit');
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/destinations')));
    });

    it('sends reopen_destination_fresh and navigates to /scout-chat', async () => {
      commandSnapshot = view(readyPlan());
      sendTripCommand = vi.fn()
        .mockResolvedValueOnce({ message: 'Revisit or fresh?', trip: view(readyPlan({ awaiting: 'destination_reopen_choice' })) })
        .mockResolvedValueOnce({ message: null, trip: view(null, undefined, { stage: 'matching', activeAgent: 'meridian' }) });
      const user = userEvent.setup();
      render(<MemoryRouter><TripPreview /></MemoryRouter>);
      await user.click(screen.getByText(/Not the right destination\?/));
      await user.click(await screen.findByRole('button', { name: 'Start a fresh search' }));

      expect(sendTripCommand).toHaveBeenLastCalledWith('reopen_destination_fresh');
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/scout-chat')));
    });
  });
});
