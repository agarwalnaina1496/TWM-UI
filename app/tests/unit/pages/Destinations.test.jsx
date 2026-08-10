import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Destinations from '../../../src/pages/Destinations.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';
import { seedState, STORAGE_KEY } from '../testUtils.js';

function seedTrip(trip) {
  seedState({ trip, auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' } });
}

function renderDestinations(initialEntries = ['/destinations?next=preview']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripProvider>
        <Destinations />
      </TripProvider>
    </MemoryRouter>
  );
}

describe('Destinations', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a thinking indicator before the fixture match results load', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();
    expect(screen.getByText(/Matching destinations to your answers/)).toBeInTheDocument();
  });

  it('renders fixture match results with a Plan-this-trip action after the match delay', () => {
    seedTrip({ budget: 'budget', style: 'nature', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('Pondicherry')).toBeInTheDocument();
    expect(screen.getAllByText('Plan this trip →').length).toBeGreaterThan(0);
  });

  it('shows a Want-to-plan-this link instead of a button when entered from discover-only', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations(['/destinations?next=none']);

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getAllByText('Want to plan this? →').length).toBeGreaterThan(0);
    expect(screen.queryByText('Plan this trip →')).not.toBeInTheDocument();
  });

  it('renders a circuit option with its places joined and a single option as "Single destination"', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('Kochi + Alleppey')).toBeInTheDocument();
    expect(screen.getByText(/Kochi \+ Alleppey circuit/)).toBeInTheDocument();
    expect(screen.getAllByText(/Single destination/).length).toBeGreaterThan(0);
  });

  it('shows a trade-off and a mismatch criteria pill, not just match scores', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('⚠ Budget')).toBeInTheDocument();
    expect(screen.getByText('✕ Travel time')).toBeInTheDocument();
  });

  it('collapses other_considerations to an intuitive "+N other considerations" chip with a tooltip preview, and expands them under the reason toggle', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    const chip = screen.getByText('+2 other considerations');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('title', 'Two check-ins to manage · Backwater cruise timing is weather-dependent');

    const singularChip = screen.getByText('+1 other consideration');
    expect(singularChip).toBeInTheDocument();
    expect(screen.queryByText('Two check-ins to manage')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Why this one')[1]); // second card: Kochi + Alleppey
    expect(screen.getByText('Two check-ins to manage')).toBeInTheDocument();
  });

  it('renders structured details (bullets, facts, cost table) instead of a single explanation string', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    fireEvent.click(screen.getAllByText('Why this one')[0]); // first card: Pondicherry

    expect(screen.getByText('French Quarter cafes and slow beach mornings')).toBeInTheDocument();
    expect(screen.getByText('Nearest airport')).toBeInTheDocument();
    expect(screen.getByText('Chennai, ~3h drive')).toBeInTheDocument();
    expect(screen.getByText('Stay + activities')).toBeInTheDocument();
    expect(screen.getByText('₹6,000–9,000')).toBeInTheDocument();
  });

  it('expands the reason-toggle to reveal the disclosed trade-off explanation', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    const toggles = screen.getAllByText('Why this one');
    expect(screen.queryByText(/houseboat night pushes the daily average up/)).not.toBeInTheDocument();

    fireEvent.click(toggles[1]); // second card: Kochi + Alleppey
    expect(screen.getByText(/houseboat night pushes the daily average up/)).toBeInTheDocument();

    fireEvent.click(toggles[1]);
    expect(screen.queryByText(/houseboat night pushes the daily average up/)).not.toBeInTheDocument();
  });

  it('persists the structured { type, name, places } shape to trip state when a circuit option is selected', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    const planButtons = screen.getAllByText('Plan this trip →');
    fireEvent.click(planButtons[1]); // second card is the Kochi + Alleppey circuit

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.trip.destination).toEqual({ type: 'circuit', name: 'Kochi + Alleppey', places: ['Kochi', 'Alleppey'] });
  });

  it('shows a qualified total-party estimate and practical access without presenting it as checked prices', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByText('₹16,400–₹22,400')).toBeInTheDocument();
    expect(screen.getAllByText(/estimated total for 2/)).toHaveLength(3);
    expect(screen.getByText('Chennai airport + ~3h road transfer')).toBeInTheDocument();
    expect(screen.getAllByText(/not checked prices/i).length).toBeGreaterThan(0);
  });

  it('More like this refreshes ranking around the referenced option without committing selection', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    const circuitCard = screen.getByText('Kochi + Alleppey').closest('.dest-card');
    fireEvent.click(circuitCard.querySelectorAll('button')[1]);

    expect(screen.getByText(/Refreshed around Kochi \+ Alleppey/)).toBeInTheDocument();
    expect(screen.getAllByText('Kochi + Alleppey')[0].closest('.dest-card')).toHaveClass('best');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).trip.destination).toBe(null);
  });

  it('Check prices safely renders current, stale, partial, unavailable, and malformed mock evidence states', () => {
    seedTrip({ budget: 'flexible', style: 'relaxed', travelers: 2, month: 'flexible' });
    renderDestinations();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    const cards = screen.getAllByText('Check prices').map(button => button.closest('.dest-card'));

    fireEvent.click(screen.getAllByText('Check prices')[0]);
    expect(screen.getByText('Verified/current mock')).toBeInTheDocument();
    expect(screen.getByText('₹16,800–₹22,200 total for the party')).toBeInTheDocument();
    expect(screen.getByText(/Prototype provider mix · Just now/)).toBeInTheDocument();

    fireEvent.click(cards[0].querySelectorAll('button')[2]);
    expect(screen.getByText('Stale mock result')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Check prices')[0]);
    expect(screen.getByText('Partial mock result')).toBeInTheDocument();
    fireEvent.click(cards[1].querySelectorAll('button')[2]);
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Check prices')[0]);
    expect(screen.getByText('Unsafe result hidden')).toBeInTheDocument();
    expect(screen.getByText(/hidden because it could not be validated safely/)).toBeInTheDocument();
    expect(screen.getAllByText(/not a live quote or availability guarantee/i).length).toBeGreaterThan(0);
  });
});
