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
  it('renders category-owned booking tabs and honest duration-only Days state', () => {
    render(<TripDashboard />);
    expect(screen.queryByText('Self-Led Trip Dashboard')).not.toBeInTheDocument();
    ['Days', 'Transport', 'Stays', 'Map', 'Support'].forEach(tab => expect(screen.getByRole('button', { name: new RegExp(tab) })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.getByText('Dec – Jan')).toBeInTheDocument();
    expect(screen.getByText('₹60,000–₹82,000')).toBeInTheDocument();
    expect(screen.queryByText('Detailed days')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adjust trip' })).not.toBeInTheDocument();
  });
  it('keeps booking links and uploaded confirmations inside their category', async () => {
    const user = userEvent.setup();
    render(<TripDashboard />);
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    const transportLinks = screen.getAllByRole('link', { name: 'Check ↗' });
    expect(transportLinks).toHaveLength(15);
    expect(screen.getByText('Gatimaan Express 12050 / other direct trains')).toBeInTheDocument();
    expect(transportLinks[0].getAttribute('href')).toMatch(/^https:\/\//);
    await user.click(screen.getByRole('button', { name: 'Upload transport confirmation' }));
    expect(updateTrip).toHaveBeenCalledWith({ atlasState: expect.objectContaining({ bookings: [expect.objectContaining({ type: 'Transport', state: 'needs_review' })] }) });
  });
  it('shows real linked stay choices for every circuit base', async () => {
    const user = userEvent.setup();
    render(<TripDashboard />);
    await user.click(screen.getByRole('button', { name: /Stays/ }));
    ['Gwalior · 3 nights', 'Orchha · 3 nights', 'Khajuraho · 4 nights', 'Panna · 3 nights'].forEach(base => expect(screen.getByText(new RegExp(base.replace('·', '·')))).toBeInTheDocument());
    expect(screen.getAllByRole('link', { name: 'Check stay ↗' })).toHaveLength(12);
    expect(screen.getByText('MPT Tansen Residency')).toBeInTheDocument();
    expect(screen.getByText('Ken River Lodge')).toBeInTheDocument();
  });
  it('renders only known map coordinates and inert malicious text', async () => {
    trip.atlasState.map_points.push({ id: 'unsafe', label: '<img src=x onerror=alert(1)>', lat: 25, lng: 79 });
    const user = userEvent.setup();
    render(<TripDashboard />);
    await user.click(screen.getByRole('button', { name: /Map/ }));
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
