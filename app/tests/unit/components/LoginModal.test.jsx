import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginModal from '../../../src/components/LoginModal.jsx';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';

function Sentinel() {
  const { auth, loginModalOpen, openLoginModal } = useTrip();
  const state = auth.loggedIn ? 'logged-in' : auth.isGuest ? 'guest' : 'none';
  return (
    <div>
      <div>Auth: {state} - {auth.name} - {auth.email}</div>
      <div>Modal open: {String(loginModalOpen)}</div>
      <button type="button" onClick={openLoginModal}>Open login</button>
    </div>
  );
}

function renderLoginModal() {
  const view = render(
    <MemoryRouter>
      <TripProvider>
        <Sentinel />
        <LoginModal />
      </TripProvider>
    </MemoryRouter>
  );
  return view;
}

async function open() {
  await userEvent.click(screen.getByText('Open login'));
}

describe('LoginModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing until opened', () => {
    renderLoginModal();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('continue without login logs in as guest and closes the overlay', async () => {
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByText('Continue without login'));
    expect(screen.getByText(/Auth: guest - Guest/)).toBeInTheDocument();
    expect(screen.getByText('Modal open: false')).toBeInTheDocument();
  });

  it('submitting the login form logs in and closes the overlay', async () => {
    renderLoginModal();
    await open();
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'trav@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'secret');
    await userEvent.click(screen.getByText('Continue →'));
    expect(screen.getByText(/Auth: logged-in - Traveler - trav@example.com/)).toBeInTheDocument();
    expect(screen.getByText('Modal open: false')).toBeInTheDocument();
  });

  it('the close (X) button closes the overlay without changing auth state', async () => {
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Modal open: false')).toBeInTheDocument();
    expect(screen.getByText(/Auth: guest - Guest/)).toBeInTheDocument();
  });

  it('switching to signup mode shows the name field and signup button', async () => {
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByText('Sign up'));
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByText('Sign up →')).toBeInTheDocument();
  });

  it('switching to forgot-password mode and sending shows the reset confirmation', async () => {
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByText('Forgot password?'));
    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'reset@example.com');
    await userEvent.click(screen.getByText('Send reset link →'));
    expect(screen.getByText(/If an account exists for/)).toBeInTheDocument();
    expect(screen.getByText('reset@example.com')).toBeInTheDocument();
  });
});
