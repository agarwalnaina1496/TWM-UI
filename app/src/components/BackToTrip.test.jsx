import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BackToTrip from './BackToTrip.jsx';

describe('BackToTrip', () => {
  it('always links to Dashboard, regardless of where it is rendered', () => {
    render(<BackToTrip />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: /back to trip/i })).toHaveAttribute('href', '/dashboard');
  });
});
