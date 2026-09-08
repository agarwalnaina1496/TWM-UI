import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChoosePlan from '../../../src/pages/ChoosePlan.jsx';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

describe('ChoosePlan operating-model fork', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps TWM-Led visible but disabled', () => {
    render(<MemoryRouter><ChoosePlan /></MemoryRouter>);
    expect(screen.getAllByText(/TWM-Led/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Choose TWM-Led →' })).toBeDisabled();
  });

  // TWM-219: no local mock trip-state to write — Self-Led is the only real
  // choice, so the pick just enters the Dashboard.
  it('enters the Dashboard on Choose Self-Led', async () => {
    render(<MemoryRouter><ChoosePlan /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Choose Self-Led →' }));
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
