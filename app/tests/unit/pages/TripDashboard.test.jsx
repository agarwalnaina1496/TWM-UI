import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripDashboard from '../../../src/pages/TripDashboard.jsx';
import { confirmStay, createAtlasDashboardState } from '../../../src/lib/mockAtlasTrip.js';

const updateTrip = vi.fn();
let trip;
vi.mock('../../../src/context/TripContext.jsx', () => ({ useTrip: () => ({ trip, updateTrip }) }));

function renderDashboard() {
  return render(<MemoryRouter><TripDashboard /></MemoryRouter>);
}

describe('Self-Led Trip Dashboard', () => {
  beforeEach(() => { vi.clearAllMocks(); trip = { plan: 'self-led', atlasState: { ...createAtlasDashboardState(), mode: 'self-led' } }; });
  it('renders category-owned booking tabs and honest duration-only Days state', () => {
    renderDashboard();
    expect(screen.queryByText('Self-Led Trip Dashboard')).not.toBeInTheDocument();
    ['Days', 'Transport', 'Stays', 'Map', 'Support'].forEach(tab => expect(screen.getByRole('button', { name: new RegExp(tab) })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.getByText('Dec – Jan')).toBeInTheDocument();
    expect(screen.getByText('₹60,000–₹82,000')).toBeInTheDocument();
    expect(screen.queryByText('Detailed days')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adjust trip' })).not.toBeInTheDocument();
  });
  it('shows Transport as a read-only view — no browsable options, only Upload proof or Arrange elsewhere', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    expect(screen.getByRole('link', { name: /Arrange bookings/ })).toHaveAttribute('href', '/logistics?tab=Transport');
    expect(screen.getByRole('button', { name: 'Upload transport confirmation' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Check ↗' })).not.toBeInTheDocument();
    expect(screen.queryByText(/SUGGESTED/i)).not.toBeInTheDocument();
  });
  it('shows Stays as a read-only view — no browsable options, only Upload proof or Arrange elsewhere', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Stays/ }));
    expect(screen.getByRole('link', { name: /Arrange bookings/ })).toHaveAttribute('href', '/logistics?tab=Stays');
    expect(screen.getByRole('button', { name: 'Upload stay confirmation' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Check stay ↗' })).not.toBeInTheDocument();
  });
  it('uploading a confirmation from the dashboard records it directly', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    await user.click(screen.getByRole('button', { name: 'Upload transport confirmation' }));
    expect(updateTrip).toHaveBeenCalledWith({ atlasState: expect.objectContaining({ bookings: [expect.objectContaining({ type: 'Transport', state: 'needs_review' })] }) });
  });
  it('shows only the confirmed stay once one has been arranged, not the rest of the circuit', async () => {
    trip.atlasState = confirmStay(trip.atlasState, 'gwalior-stay');
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Stays/ }));
    expect(screen.getByText(/Gwalior · 3 nights/)).toBeInTheDocument();
    expect(screen.queryByText(/Orchha · 3 nights/)).not.toBeInTheDocument();
    expect(screen.getByText('✓ SAMPLE-GWALIOR-STAY')).toBeInTheDocument();
  });
  it('surfaces uploaded confirmations from either category once arranged', async () => {
    trip.atlasState.bookings.push({ id: 'upload-1', type: 'Stay', label: 'Uploaded stay confirmation', state: 'needs_review', detail: 'Fixture upload · details not yet extracted' });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Stays/ }));
    expect(screen.getByText('Uploaded stay confirmation')).toBeInTheDocument();
  });
  it('renders only known map coordinates and inert malicious text', async () => {
    trip.atlasState.map_points.push({ id: 'unsafe', label: '<img src=x onerror=alert(1)>', lat: 25, lng: 79 });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('button', { name: /Map/ }));
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
