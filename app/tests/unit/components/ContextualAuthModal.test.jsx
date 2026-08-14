import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ContextualAuthModal from '../../../src/components/ContextualAuthModal.jsx';
import LoginModal from '../../../src/components/LoginModal.jsx';
import { TripProvider } from '../../../src/context/TripContext.jsx';

function Harness({ initialOpen = true, onContinueWithoutLogin }) {
  return (
    <MemoryRouter>
      <TripProvider>
        <ContextualAuthModal
          open={initialOpen}
          onClose={() => {}}
          benefit="Log in to sync this trip across devices"
          guestNote="Your current trip stays available on this device either way."
          onContinueWithoutLogin={onContinueWithoutLogin}
        />
        <LoginModal />
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

  it('"Log in and sync" closes this modal and opens the login overlay in its place', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Log in and sync' }));
    expect(screen.getByRole('heading', { name: /log in to continue/i })).toBeInTheDocument();
  });

  it('Continue without login stays on the originating screen and calls the dismiss callback', async () => {
    const onContinueWithoutLogin = vi.fn();
    render(<Harness onContinueWithoutLogin={onContinueWithoutLogin} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue without login' }));
    expect(onContinueWithoutLogin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: /log in to continue/i })).not.toBeInTheDocument();
  });

  it('focuses the first action button on open for keyboard accessibility', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Log in and sync' })).toHaveFocus();
  });
});
