import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChoosePlan from '../../../src/pages/ChoosePlan.jsx';

const updateTrip = vi.fn();
const navigate = vi.fn();
const trip = { atlasState: { mode: null, current_version_id: 'atlas-v1' } };
vi.mock('../../../src/context/TripContext.jsx', () => ({ useTrip: () => ({ trip, updateTrip }) }));
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

describe('ChoosePlan operating-model fork', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps TWM-Led visible but disabled', () => {
    render(<MemoryRouter><ChoosePlan /></MemoryRouter>);
    expect(screen.getAllByText(/TWM-Led/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Choose TWM-Led →' })).toBeDisabled();
  });
  it('persists Self-Led ownership before entering Dashboard', async () => {
    render(<MemoryRouter><ChoosePlan /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Choose Self-Led →' }));
    expect(updateTrip).toHaveBeenCalledWith({ plan: 'self-led', atlasState: expect.objectContaining({ mode: 'self-led' }) });
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
