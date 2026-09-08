import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { TripProvider } from '../../src/context/TripContext.jsx';
import { SeedAuth, mockFetchWithGuestSession } from './testUtils.js';

function renderApp(initialEntries, auth) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripProvider>
        {auth ? <SeedAuth auth={auth}><App /></SeedAuth> : <App />}
      </TripProvider>
    </MemoryRouter>
  );
}

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// TWM-220: the command/first-message response carries only message +
// agent_meta + a (possibly absent) round; TripContext re-fetches the
// composed TripView. So each turn is mocked as a pair: the command
// response, then GET /trips/{id} -> a TripView.
function commandResponse(message, { recommendation = null } = {}) {
  return jsonResponse({ message, agent_meta: null, recommendation, trip: { id: 'trip-1', version: 1 } });
}
function tripView(overrides = {}) {
  return jsonResponse({
    id: 'trip-1', title: 'Untitled Trip', product_mode: 'self_led', version: 2,
    ui_state: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    lifecycle: { stage: 'new', status: 'free', active_agent: null, selected_option: null },
    context_recap: [], plan: null,
    matcher: { last_message: null, awaiting: null, has_recommendation: false },
    summary: null, booking: null, budget_breakdown: null, open_gaps: null, before_you_go: null,
    ...overrides,
  });
}

describe('App guest-first routing (TWM-140)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('enters Dashboard-home directly for a fresh anonymous visitor, never redirecting to Login', () => {
    renderApp(['/']);
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /log in to/i })).not.toBeInTheDocument();
  });

  it('renders a deep-linked journey route directly without an explicit guest seed', () => {
    renderApp(['/my-trips']);
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
  });

  it('lets a logged-in user reach My Trips without a redirect', () => {
    renderApp(['/my-trips'], { loggedIn: true, isGuest: false, name: 'Traveler', email: 't@example.com' });
    expect(screen.getByRole('heading', { name: /your trips/i })).toBeInTheDocument();
  });

  describe('Discover entry against real trip commands', () => {
    let fetchMock;

    beforeEach(() => {
      fetchMock = mockFetchWithGuestSession();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows a hardcoded welcome with no Backend call until the traveler sends their first message, then sends entry_intent="discover"', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ trips: [] }))          // boot list
        .mockResolvedValueOnce(commandResponse('What is your rough budget?')) // POST /first-message
        .mockResolvedValueOnce(tripView({                            // GET /trips/trip-1
          lifecycle: { stage: 'matching', status: 'free', active_agent: 'meridian', selected_option: null },
          matcher: { last_message: 'What is your rough budget?', awaiting: 'budget', has_recommendation: false },
        }))
        .mockResolvedValueOnce(commandResponse('Here are a few options.')) // POST /commands
        .mockResolvedValueOnce(tripView({                            // GET /trips/trip-1
          lifecycle: { stage: 'recommended', status: 'free', active_agent: null, selected_option: null },
          matcher: { last_message: 'Here are a few options.', awaiting: null, has_recommendation: true },
        }));

      renderApp(['/journey-entry?intent=discover_destination']);

      expect(await screen.findByText(/Hey there! I'm Scout\. Tell me about the trip you have in mind\. I can help you find destinations that fit/)).toBeInTheDocument();
      expect(screen.getByText('To start, where will you be traveling from?')).toBeInTheDocument();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      await user.type(screen.getByPlaceholderText('Tell Scout about your trip…'), 'Somewhere relaxing{Enter}');

      expect(await screen.findByText('What is your rough budget?')).toBeInTheDocument();
      expect(screen.getByText('Somewhere relaxing', { selector: '.chat-bub-user' })).toBeInTheDocument();
      expect(fetchMock.mock.calls[1][0]).toBe('/api/trips/first-message');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).entry_intent).toBe('discover');

      await user.click(await screen.findByRole('button', { name: '₹1,00,000 total for both' }));

      expect(await screen.findByRole('button', { name: 'See destinations →' })).toBeInTheDocument();
      expect(JSON.parse(fetchMock.mock.calls[3][1].body).command).toBe('traveler_message');
    });
  });

  it('uses the full-height chat shell for advice and known-destination entry', () => {
    const advice = renderApp(['/scout-chat?entry=advice']);
    expect(screen.getByText('Scout is here to help with your trip.').closest('.chat-screen')).toBeInTheDocument();
    advice.unmount();

    renderApp(['/journey-entry?intent=known_destination']);
    expect(screen.getByText('Scout is here to help with your trip.').closest('.chat-screen')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Coorg, Karnataka')).toBeInTheDocument();
  });

  describe('Known Destination entry against real trip commands', () => {
    let fetchMock;

    beforeEach(() => {
      fetchMock = mockFetchWithGuestSession();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sends entry_intent="known_destination" with the raw message and, once Guide generates places and a day plan together, lands on the unified Plan Builder — never /dashboard', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ trips: [] }))          // boot list
        .mockResolvedValueOnce(commandResponse("Anything else you'd like to add? Any other preferences?")) // POST /first-message
        .mockResolvedValueOnce(tripView({                            // GET /trips/trip-1
          lifecycle: { stage: 'planning', status: 'free', active_agent: 'guide', selected_option: null },
          context_recap: [{ key: 'destinations', label: 'Destination', value: 'Coorg' }],
          plan: { places: [], day_plan: [], frozen: false, awaiting: 'anything_else' },
        }));

      renderApp(['/journey-entry?intent=known_destination']);
      await user.type(screen.getByPlaceholderText('e.g. Coorg, Karnataka'), 'Coorg{Enter}');

      expect(await screen.findByText("Anything else you'd like to add? Any other preferences?")).toBeInTheDocument();
      expect(screen.getByText('Coorg', { selector: '.chat-bub-user' })).toBeInTheDocument();
      expect(fetchMock.mock.calls[1][0]).toBe('/api/trips/first-message');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ entry_intent: 'known_destination', message: 'Coorg' });

      fetchMock
        .mockResolvedValueOnce(commandResponse('Here is your plan.'))  // POST /commands
        .mockResolvedValueOnce(tripView({                              // GET /trips/trip-1
          lifecycle: { stage: 'planning', status: 'free', active_agent: 'guide', selected_option: null },
          context_recap: [{ key: 'destinations', label: 'Destination', value: 'Coorg' }],
          plan: {
            places: ['Coorg Palace'],
            day_plan: [{ day_number: 1, places: ['Coorg Palace'], pace: 'balanced', buffer_note: null }],
            frozen: false, awaiting: null,
          },
        }));
      await user.type(screen.getByPlaceholderText("Anything else, or just say you're ready"), "Nothing else{Enter}");

      expect(await screen.findByText('Coorg Palace')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Approve this plan/ })).toBeInTheDocument();
    });
  });
});
