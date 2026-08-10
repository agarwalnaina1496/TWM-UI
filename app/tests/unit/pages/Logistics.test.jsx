import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Logistics from '../../../src/pages/Logistics.jsx';
import { createAtlasDashboardState } from '../../../src/lib/mockAtlasTrip.js';

const updateTrip = vi.fn();
const navigate = vi.fn();
let trip;
vi.mock('../../../src/context/TripContext.jsx', () => ({ useTrip: () => ({ trip, updateTrip }) }));
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual('react-router-dom')), useNavigate: () => navigate }));

function renderLogistics() {
  return render(<MemoryRouter><Logistics /></MemoryRouter>);
}

describe('Logistics — arrange bookings for a Self-Led trip', () => {
  beforeEach(() => { vi.clearAllMocks(); trip = { destination: { name: 'Madhya Pradesh Heritage and Nature' }, plan: 'self-led', atlasState: { ...createAtlasDashboardState(), mode: 'self-led' } }; });

  it('shows real linked transport choices on the Transport tab, with a way back to the dashboard to upload', async () => {
    const user = userEvent.setup();
    renderLogistics();
    expect(screen.getByText('Gatimaan Express 12050 / other direct trains')).toBeInTheDocument();
    const transportLinks = screen.getAllByRole('link', { name: 'Check ↗' });
    expect(transportLinks).toHaveLength(15);
    expect(transportLinks[0].getAttribute('href')).toMatch(/^https:\/\//);
    expect(screen.getByRole('link', { name: /Upload it on your dashboard/ })).toHaveAttribute('href', '/dashboard?tab=Transport');

    await user.click(screen.getByRole('button', { name: /Stays/ }));
    ['Gwalior · 3 nights', 'Orchha · 3 nights', 'Khajuraho · 4 nights', 'Panna · 3 nights'].forEach(base => expect(screen.getByText(new RegExp(base.replace('·', '·')))).toBeInTheDocument());
    expect(screen.getAllByRole('link', { name: 'Check stay ↗' })).toHaveLength(12);
    expect(screen.getByRole('link', { name: /Upload it on your dashboard/ })).toHaveAttribute('href', '/dashboard?tab=Stays');
  });

  it('has no upload actions — arranging bookings happens here, uploading proof happens on the dashboard', () => {
    renderLogistics();
    expect(screen.queryByRole('button', { name: /Upload/ })).not.toBeInTheDocument();
  });

  it('creates a reviewable booking-driven diff without replacing current Days', async () => {
    const user = userEvent.setup();
    renderLogistics();
    await user.click(screen.getByRole('button', { name: /Simulate confirmed 2:00 PM arrival/ }));
    const next = updateTrip.mock.calls.at(-1)[0].atlasState;
    expect(next.current_version_id).toBe('atlas-v1');
    expect(next.proposed_revision.affected_days).toEqual([1, 3]);
  });

  it('continues to the dashboard once arranging is done', async () => {
    const user = userEvent.setup();
    renderLogistics();
    await user.click(screen.getByRole('button', { name: /Continue to dashboard/ }));
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
