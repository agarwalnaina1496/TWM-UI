import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { TripProvider } from '../../src/context/TripContext.jsx';
import { SeedAuth } from './testUtils.js';

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

  it('enters the journey directly for a fresh anonymous visitor, never redirecting to Login', () => {
    renderApp(['/']);
    expect(screen.getByRole('heading', { name: /where are we headed/i })).toBeInTheDocument();
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
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows a hardcoded welcome with no Backend call until the traveler sends their first message, then fires discover_entry', async () => {
      const user = userEvent.setup();
      fetchMock
        // TripContext boot: list (empty, no trip yet) — the trip itself is
        // created lazily below, by the traveler's first sent message.
        .mockResolvedValueOnce(jsonResponse({ trips: [] }))
        .mockResolvedValueOnce(jsonResponse(tripRecord()))
        // discover_entry: Meridian needs clarification, no Scout call
        .mockResolvedValueOnce(jsonResponse({
          message: 'What is your rough budget?',
          agent_meta: null,
          trip: tripRecord({
            version: 2,
            trip_state: { stage: 'matching', active_agent: 'meridian', matcher_state: { conversation_context: { awaiting: 'budget' } } },
          }),
        }))
        // traveler_message follow-up: Meridian recommends
        .mockResolvedValueOnce(jsonResponse({
          message: 'Here are a few options.',
          agent_meta: null,
          trip: tripRecord({ version: 3, trip_state: { stage: 'recommended', active_agent: null } }),
        }));

      renderApp(['/journey-entry?intent=discover_destination']);

      expect(await screen.findByText(/tell me about the trip you have in mind/i)).toBeInTheDocument();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); // boot list only — no trip yet, no command sent

      await user.type(screen.getByPlaceholderText('Tell Scout about your trip…'), 'Somewhere relaxing{Enter}');

      expect(await screen.findByText('What is your rough budget?')).toBeInTheDocument();
      expect(fetchMock.mock.calls[2][0]).toBe('/api/trips/trip-1/commands');
      expect(JSON.parse(fetchMock.mock.calls[2][1].body).command).toBe('discover_entry');

      await user.click(screen.getByRole('button', { name: '₹1,00,000 total for both' }));

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

  describe('Scout entry (own words) against real trip commands', () => {
    let fetchMock;

    beforeEach(() => {
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sends the first turn as scout_entry, then plain traveler_message on follow-ups', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ trips: [] }))
        .mockResolvedValueOnce(jsonResponse(tripRecord()))
        .mockResolvedValueOnce(jsonResponse({
          message: 'Where will you be travelling from?',
          agent_meta: null,
          trip: tripRecord({ version: 2, trip_state: { stage: 'new', active_agent: 'scout' } }),
        }))
        .mockResolvedValueOnce(jsonResponse({
          message: 'Got it, one moment.',
          agent_meta: null,
          trip: tripRecord({ version: 3, trip_state: { stage: 'matching', active_agent: 'meridian' } }),
        }));

      renderApp(['/scout-chat?entry=advice']);
      await user.type(screen.getByPlaceholderText('Ask Scout a travel question…'), 'Plan my Coorg trip{Enter}');

      expect(await screen.findByText('Where will you be travelling from?')).toBeInTheDocument();
      expect(JSON.parse(fetchMock.mock.calls[2][1].body).command).toBe('scout_entry');

      await user.type(screen.getByPlaceholderText('Ask Scout a travel question…'), 'Delhi{Enter}');

      expect(await screen.findByText('Got it, one moment.')).toBeInTheDocument();
      expect(JSON.parse(fetchMock.mock.calls[3][1].body).command).toBe('traveler_message');
    });
  });

  describe('Known Destination entry against real trip commands', () => {
    let fetchMock;

    beforeEach(() => {
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sends known_destination_entry with the typed destination and invokes Guide', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ trips: [] }))
        .mockResolvedValueOnce(jsonResponse(tripRecord()))
        .mockResolvedValueOnce(jsonResponse({
          message: 'Here are the places.',
          agent_meta: null,
          trip: tripRecord({ version: 2, trip_state: { stage: 'planning', active_agent: 'guide', trip_context: { destination: 'Coorg' } } }),
        }));

      renderApp(['/journey-entry?intent=known_destination']);
      await user.type(screen.getByPlaceholderText('e.g. Coorg, Karnataka'), 'Coorg{Enter}');

      expect(await screen.findByText('Here are the places.')).toBeInTheDocument();
      expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ command: 'known_destination_entry', destination: 'Coorg' });
      expect(await screen.findByRole('button', { name: 'Continue to planning →' })).toBeInTheDocument();
    });
  });
});
