import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripPreview from '../../../src/pages/TripPreview.jsx';

const updateTrip = vi.fn();
const navigate = vi.fn();
let trip;
vi.mock('../../../src/context/TripContext.jsx', () => ({ useTrip: () => ({ trip, updateTrip }) }));
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

describe('TripPreview unified Plan Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trip = { destination: { id: 'gwalior-orchha-khajuraho-panna', name: 'Madhya Pradesh Heritage and Nature' }, tripContext: { original_traveler_request: 'exact request' } };
  });

  it('shows places and broad days together with one generation action', () => {
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Madhya Pradesh Heritage and Nature/ })).toBeInTheDocument();
    expect(screen.getByText('Gwalior Fort')).toBeInTheDocument();
    expect(screen.getByLabelText('Gwalior days')).toHaveValue(3);
    expect(screen.getByText('Duration-only · Day 1–14')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Generate detailed itinerary/ })).toHaveLength(1);
    expect(screen.queryByText(/Approve places|Approve itinerary/)).not.toBeInTheDocument();
  });

  it('recalculates duration, supports undo and displays a route warning', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Gwalior days'), { target: { value: '4' } });
    expect(screen.getByText('Duration-only · Day 1–15')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Move Orchha earlier'));
    expect(screen.getByRole('alert')).toHaveTextContent('Route order changed');
    await user.click(screen.getByRole('button', { name: 'Undo last change' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('persists the frozen handoff and continues to choose plan', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TripPreview /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Generate detailed itinerary/ }));
    expect(updateTrip).toHaveBeenLastCalledWith(expect.objectContaining({ guideSnapshot: expect.objectContaining({ status: 'PLAN_APPROVED', approved_revision: 1 }), tripLength: 14 }));
    expect(navigate).toHaveBeenCalledWith('/choose-plan');
  });
});
