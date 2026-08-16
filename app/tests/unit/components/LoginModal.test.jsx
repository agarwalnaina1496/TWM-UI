import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginModal from '../../../src/components/LoginModal.jsx';
import ClaimConfirmation from '../../../src/components/ClaimConfirmation.jsx';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';
import { mockFetchWithGuestSession } from '../testUtils.js';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

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
        <ClaimConfirmation />
      </TripProvider>
    </MemoryRouter>
  );
  return view;
}

async function open() {
  await userEvent.click(screen.getByText('Open login'));
}

describe('LoginModal', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = mockFetchWithGuestSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('submitting the login form calls the real endpoint, logs in, and closes the overlay', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/auth/login') return Promise.resolve(jsonResponse(200, { id: 'u1', email: 'trav@example.com', claimed_trip_count: 0 }));
      return Promise.resolve(jsonResponse(200, { trips: [] }));
    });
    renderLoginModal();
    await open();
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'trav@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'hunter22!!');
    await userEvent.click(screen.getByText('Continue →'));

    expect(await screen.findByText(/Auth: logged-in - trav@example.com - trav@example.com/)).toBeInTheDocument();
    expect(screen.getByText('Modal open: false')).toBeInTheDocument();
  });

  it('shows the real error and keeps the overlay open on wrong credentials', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/auth/login') return Promise.resolve(jsonResponse(401, { detail: 'Incorrect email or password.' }));
      return Promise.resolve(jsonResponse(200, { trips: [] }));
    });
    renderLoginModal();
    await open();
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'trav@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrong');
    await userEvent.click(screen.getByText('Continue →'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByText('Modal open: true')).toBeInTheDocument();
    expect(screen.getByText(/Auth: guest - Guest/)).toBeInTheDocument();
  });

  it('the close (X) button closes the overlay without changing auth state', async () => {
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Modal open: false')).toBeInTheDocument();
    expect(screen.getByText(/Auth: guest - Guest/)).toBeInTheDocument();
  });

  it('switching to signup mode shows the signup button and no name field (Backend accounts are email + password only)', async () => {
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByText('Sign up'));
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
    expect(screen.getByText('Sign up →')).toBeInTheDocument();
  });

  it('submitting the signup form calls signup then login, and shows the claim-confirmation moment', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/auth/signup') return Promise.resolve(jsonResponse(201, { id: 'u1', email: 'trav@example.com', claimed_trip_count: 1 }));
      if (url === '/api/auth/login') return Promise.resolve(jsonResponse(200, { id: 'u1', email: 'trav@example.com', claimed_trip_count: 0 }));
      return Promise.resolve(jsonResponse(200, { trips: [] }));
    });
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByText('Sign up'));
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'trav@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'hunter22!!');
    await userEvent.click(screen.getByText('Sign up →'));

    expect(await screen.findByText(/Auth: logged-in - trav@example.com/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText('Your trip is now saved to your account.')).toBeInTheDocument();
  });

  it('shows the real error on a duplicate-email signup', async () => {
    fetchMock.mockImplementation((url) => {
      if (url === '/api/auth/signup') return Promise.resolve(jsonResponse(409, { detail: 'Email is already registered.' }));
      return Promise.resolve(jsonResponse(200, { trips: [] }));
    });
    renderLoginModal();
    await open();
    await userEvent.click(screen.getByText('Sign up'));
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'trav@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'hunter22!!');
    await userEvent.click(screen.getByText('Sign up →'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email is already registered.');
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
