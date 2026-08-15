import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusPill, { STATUS_PILL_TONES, STATUS_PILL_VARIANTS } from '../../../../src/components/ui/StatusPill.jsx';

describe('StatusPill', () => {
  for (const tone of STATUS_PILL_TONES) {
    for (const variant of STATUS_PILL_VARIANTS) {
      it(`renders the ${tone} tone in the ${variant} variant`, () => {
        render(<StatusPill tone={tone} variant={variant}>Label</StatusPill>);
        const pill = screen.getByText('Label');
        expect(pill).toHaveClass(`status-pill-${tone}`);
        expect(pill).toHaveClass(`status-pill-${variant}`);
      });
    }
  }

  it('falls back to the neutral tone for an unrecognized value', () => {
    render(<StatusPill tone="unknown">Label</StatusPill>);
    expect(screen.getByText('Label')).toHaveClass('status-pill-neutral');
  });

  it('falls back to the filled variant for an unrecognized value', () => {
    render(<StatusPill tone="positive" variant="unknown">Label</StatusPill>);
    expect(screen.getByText('Label')).toHaveClass('status-pill-filled');
  });

  it('renders an icon when provided', () => {
    render(<StatusPill tone="positive" icon="✓">Match</StatusPill>);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
