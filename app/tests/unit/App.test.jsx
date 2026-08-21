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

function tripRecord(overrides = {}) {
  return {
    id: 'trip-1', title: 'Untitled Trip', product_mode: 'self_led', version: 1,
    trip_state: {}, ui_state: {}, updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
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

    it('shows a hardcoded welcome with no Backend call until the traveler sends their first message, then fires discover_entry', async () => {
      const user = userEvent.setup();
      fetchMock
        // TripContext boot: list (empty, no trip yet) — the trip itself is
        // created below, atomically with the traveler's first message
        // (TWM-189: no bare create beforehand).
        .mockResolvedValueOnce(jsonResponse({ trips: [] }))
        // discover_entry via POST /trips/first-message: Meridian needs
        // clarification, no Scout call, and this single request both
        // creates the trip and returns its first response.
        .mockResolvedValueOnce(jsonResponse({
          message: 'What is your rough budget?',
          agent_meta: null,
          trip: tripRecord({
            trip_state: { stage: 'matching', active_agent: 'meridian', matcher_state: { conversation_context: { awaiting: 'budget' } } },
          }),
        }, { status: 201 }))
        // traveler_message follow-up: Meridian recommends
        .mockResolvedValueOnce(jsonResponse({
          message: 'Here are a few options.',
          agent_meta: null,
          trip: tripRecord({ version: 3, trip_state: { stage: 'recommended', active_agent: null } }),
        }));

      renderApp(['/journey-entry?intent=discover_destination']);

      // TWM-190: JourneyEntry.jsx now only sends the first message — the
      // welcome/prompt shown here is its own, not a chat transcript entry.
      expect(await screen.findByText(/tell Scout what matters to you/i)).toBeInTheDocument();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); // boot list only — no trip yet, no command sent

      await user.type(screen.getByPlaceholderText('Tell Scout about your trip…'), 'Somewhere relaxing{Enter}');

      // JourneyEntry navigates to /scout-chat once the first command
      // resolves — the exchange renders there, not inline. openTrip's
      // own fetch short-circuits (startTrip already marked the record
      // full), so no extra call is needed for the route change itself.
      expect(await screen.findByText('What is your rough budget?')).toBeInTheDocument();
      expect(screen.getByText('Somewhere relaxing', { selector: '.chat-bub-user' })).toBeInTheDocument();
      expect(fetchMock.mock.calls[1][0]).toBe('/api/trips/first-message');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).command).toBe('discover_entry');

      await user.click(screen.getByRole('button', { name: '₹1,00,000 total for both' }));

      expect(await screen.findByRole('button', { name: 'See destinations →' })).toBeInTheDocument();
      expect(JSON.parse(fetchMock.mock.calls[2][1].body).command).toBe('traveler_message');
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

  // TWM-188/189: /scout-chat is only ever reached as a resume of an
  // already-existing trip (via a Dashboard/My Trips resume CTA) — no live
  // navigation ever lands here trip-less. The removed test here exercised
  // ScoutChat.jsx sending a bare scout_entry against no trip at all, a
  // scenario TWM-188 explicitly stops any live caller from producing and
  // TWM-189's stricter POST /trips contract can no longer support via
  // lazy ensureTrip() creation. ScoutChat.jsx's resume-path behavior
  // (traveler_message/continue against an existing trip) is unchanged and
  // untested here since this repo's ScoutChat resume coverage lives
  // elsewhere.

  describe('Known Destination entry against real trip commands', () => {
    let fetchMock;

    beforeEach(() => {
      fetchMock = mockFetchWithGuestSession();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sends known_destination_entry and, once Guide generates places and a day plan together, lands on the unified Plan Builder — never /dashboard', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ trips: [] }))
        // known_destination_entry via POST /trips/first-message — one
        // request both creates the trip and returns Guide's first turn
        // (TWM-189: no bare create beforehand).
        .mockResolvedValueOnce(jsonResponse({
          message: "Anything else you'd like to add? Any other preferences?",
          agent_meta: null,
          trip: tripRecord({
            trip_state: {
              stage: 'planning',
              active_agent: 'guide',
              trip_context: { destinations: ['Coorg'], trip_duration: 3 },
              planner_state: {
                conversation_context: { awaiting: 'anything_else' },
                places: [],
                day_plan: [],
              },
            },
          }),
        }, { status: 201 }));

      renderApp(['/journey-entry?intent=known_destination']);
      await user.type(screen.getByPlaceholderText('e.g. Coorg, Karnataka'), 'Coorg{Enter}');

      // TWM-190: JourneyEntry redirects to /scout-chat after the first
      // command resolves — the exchange renders there, not inline.
      expect(await screen.findByText("Anything else you'd like to add? Any other preferences?")).toBeInTheDocument();
      expect(screen.getByText('Coorg', { selector: '.chat-bub-user' })).toBeInTheDocument();
      expect(fetchMock.mock.calls[1][0]).toBe('/api/trips/first-message');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ command: 'known_destination_entry', destination: 'Coorg' });

      fetchMock.mockResolvedValueOnce(jsonResponse({
        message: 'Here is your plan.',
        agent_meta: null,
        trip: tripRecord({
          version: 3,
          trip_state: {
            stage: 'planning',
            active_agent: 'guide',
            trip_context: { destinations: ['Coorg'], trip_duration: 1 },
            planner_state: {
              conversation_context: { awaiting: null },
              places: ['Coorg Palace'],
              day_plan: [{ day_number: 1, date: null, places: ['Coorg Palace'], pace: 'balanced', buffer_note: null }],
            },
          },
        }),
      }));
      // TWM-190: the follow-up is now sent from ScoutChat's own composer,
      // which uses a static placeholder (no per-question tracking there).
      await user.type(screen.getByPlaceholderText('Ask Scout a travel question…'), "Nothing else{Enter}");

      // The unified Plan Builder (TripPreview), not the chat, now shows the
      // generated plan — the known-destination path never lands on /dashboard.
      expect(await screen.findByText('Coorg Palace')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Approve this plan/ })).toBeInTheDocument();
    });
  });
});
