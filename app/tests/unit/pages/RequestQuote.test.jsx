import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequestQuote from '../../../src/pages/RequestQuote.jsx';
import { TripProvider, useTrip } from '../../../src/context/TripContext.jsx';

function AuthSentinel() {
  const { auth } = useTrip();
  return <div>Auth: {auth.loggedIn ? 'logged-in' : 'not-logged-in'} - {auth.name} - {auth.email}</div>;
}

function renderRequestQuote() {
  return render(
    <TripProvider>
      <RequestQuote />
      <AuthSentinel />
    </TripProvider>
  );
}

describe('RequestQuote', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates contact via setContact on submit without logging in', async () => {
    renderRequestQuote();

    const nameInput = screen.getByPlaceholderText('Your name');
    const emailInput = screen.getByPlaceholderText('you@email.com');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Jane');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'jane@example.com');

    await userEvent.click(screen.getByText('Request a quote →'));

    expect(screen.getByText('Request sent')).toBeInTheDocument();
    expect(screen.getByText('Auth: not-logged-in - Jane - jane@example.com')).toBeInTheDocument();
  });
});
