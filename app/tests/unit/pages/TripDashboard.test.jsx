import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripDashboard from '../../../src/pages/TripDashboard.jsx';
import { createAtlasDashboardState } from '../../../src/lib/mockAtlasTrip.js';

const updateTrip = vi.fn();
let trip;
vi.mock('../../../src/context/TripContext.jsx', () => ({ useTrip: () => ({ trip, updateTrip }) }));

describe('Self-Led Trip Dashboard', () => {
  beforeEach(() => { vi.clearAllMocks(); trip = { plan: 'self-led', atlasState: { ...createAtlasDashboardState(), mode: 'self-led' } }; });
  it('renders all five tabs and honest duration-only Days state', () => {
    render(<TripDashboard />);
    ['Days', 'Transport', 'Stays', 'Bookings', 'Map'].forEach(tab => expect(screen.getByRole('button', { name: tab })).toBeInTheDocument());
    expect(screen.getByText('No dates confirmed · Itinerary version 1')).toBeInTheDocument();
    expect(screen.getByText('₹60,000–₹82,000')).toBeInTheDocument();
  });
  it('shows honest booking empty state and upload review state', async () => {
    const user = userEvent.setup();
    render(<TripDashboard />);
    await user.click(screen.getByRole('button', { name: 'Bookings' }));
    expect(screen.getByText('No bookings yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upload confirmation' }));
    expect(updateTrip).toHaveBeenCalledWith({ atlasState: expect.objectContaining({ bookings: [expect.objectContaining({ state: 'needs_review' })] }) });
  });
  it('creates a reviewable booking-driven diff without replacing current Days', async () => {
    const user = userEvent.setup();
    render(<TripDashboard />);
    await user.click(screen.getByRole('button', { name: 'Transport' }));
    await user.click(screen.getByRole('button', { name: /Simulate confirmed 2:00 PM arrival/ }));
    const next = updateTrip.mock.calls.at(-1)[0].atlasState;
    expect(next.current_version_id).toBe('atlas-v1');
    expect(next.proposed_revision.affected_days).toEqual([1, 3]);
  });
  it('renders only known map coordinates and inert malicious text', async () => {
    trip.atlasState.map_points.push({ id: 'unsafe', label: '<img src=x onerror=alert(1)>', lat: 25, lng: 79 });
    const user = userEvent.setup();
    render(<TripDashboard />);
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
