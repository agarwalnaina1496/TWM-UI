import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from '../../../src/pages/Login.jsx';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';

function Sentinel() {
  const { auth } = useTrip();
  const state = auth.loggedIn ? 'logged-in' : auth.isGuest ? 'guest' : 'none';
  return <div>Home: {state} - {auth.name} - {auth.email}</div>;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <TripProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Sentinel />} />
        </Routes>
      </TripProvider>
    </MemoryRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('continue without login navigates home as a guest', async () => {
    renderLogin();
    await userEvent.click(screen.getByText('Continue without login'));
    expect(screen.getByText(/Home: guest - Guest/)).toBeInTheDocument();
  });

  it('submitting the login form logs in and navigates home', async () => {
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'trav@example.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'secret');
    await userEvent.click(screen.getByText('Continue →'));
    expect(screen.getByText(/Home: logged-in - Traveler - trav@example.com/)).toBeInTheDocument();
  });

  it('switching to signup mode shows the name field and signup button', async () => {
    renderLogin();
    await userEvent.click(screen.getByText('Sign up'));
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByText('Sign up →')).toBeInTheDocument();
  });

  it('switching to forgot-password mode and sending shows the reset confirmation', async () => {
    renderLogin();
    await userEvent.click(screen.getByText('Forgot password?'));
    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('you@email.com'), 'reset@example.com');
    await userEvent.click(screen.getByText('Send reset link →'));
    expect(screen.getByText(/If an account exists for/)).toBeInTheDocument();
    expect(screen.getByText('reset@example.com')).toBeInTheDocument();
  });
});
