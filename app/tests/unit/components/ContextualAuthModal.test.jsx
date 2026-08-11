import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ContextualAuthModal from '../../../src/components/ContextualAuthModal.jsx';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';

function Sentinel() {
  const { pendingReturnTo } = useTrip();
  return <div>Login screen, return to: {pendingReturnTo}</div>;
}

function Harness({ initialOpen = true, onContinueWithoutLogin }) {
  return (
    <MemoryRouter initialEntries={['/my-trips']}>
      <TripProvider>
        <Routes>
          <Route
            path="/my-trips"
            element={
              <ContextualAuthModal
                open={initialOpen}
                onClose={() => {}}
                benefit="Log in to sync this trip across devices"
                guestNote="Your current trip stays available on this device either way."
                onContinueWithoutLogin={onContinueWithoutLogin}
              />
            }
          />
          <Route path="/login" element={<Sentinel />} />
        </Routes>
      </TripProvider>
    </MemoryRouter>
  );
}

describe('ContextualAuthModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing when closed', () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows capability-specific benefit copy, both actions, and an accessible dialog label', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Log in to sync this trip across devices')).toBeInTheDocument();
    expect(screen.getByText(/stays available on this device either way/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in and sync' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue without login' })).toBeInTheDocument();
  });

  it('opens Login and preserves the originating route only after Log in and sync is chosen', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Log in and sync' }));
    expect(screen.getByText('Login screen, return to: /my-trips')).toBeInTheDocument();
  });

  it('Continue without login stays on the originating screen and calls the dismiss callback', async () => {
    const onContinueWithoutLogin = vi.fn();
    render(<Harness onContinueWithoutLogin={onContinueWithoutLogin} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue without login' }));
    expect(onContinueWithoutLogin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Login screen/)).not.toBeInTheDocument();
  });

  it('focuses the first action button on open for keyboard accessibility', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Log in and sync' })).toHaveFocus();
  });
});
