import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawerDateRow, DrawerPartyRow } from '../../../../src/components/drawers/DrawerRows.jsx';

// TWM-228: the shared drawer rows behave as a standard OTA search form —
// a known value pre-filled and collapsed behind "· Change", the picker
// expanded only when the value is unknown.
describe('DrawerDateRow', () => {
  it('renders an exact date collapsed behind "Change", with the check-out line', () => {
    render(
      <DrawerDateRow
        label="Check-in" precision="exact" valueLabel="Sep 26" checkoutLabel="Sep 28"
        onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>}
      />,
    );
    expect(screen.getByText(/Check-in: Sep 26/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByText('Check-out Sep 28')).toBeInTheDocument();
    expect(screen.queryByText('Add a date for this search')).not.toBeInTheDocument();
    expect(screen.queryByText('FORM')).not.toBeInTheDocument();
  });

  it('renders a month-precision date collapsed behind "Change", with no check-out line', () => {
    render(
      <DrawerDateRow
        label="Check-in" precision="month" valueLabel="October 2026" checkoutLabel="Nov 1"
        onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>}
      />,
    );
    expect(screen.getByText(/Check-in: October 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByText(/Check-out/)).not.toBeInTheDocument();
  });

  it('shows a collapsed "Add a date" button when no date is resolved and the form is closed', () => {
    render(
      <DrawerDateRow
        label="Check-in" precision="none" valueLabel={null}
        onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add a date for this search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByText('FORM')).not.toBeInTheDocument();
  });

  it('shows only the picker when no date is resolved and the form is open', () => {
    render(
      <DrawerDateRow
        label="Check-in" precision="none" valueLabel={null}
        onEdit={() => {}} editOpen editForm={<div>FORM</div>}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add a date for this search' })).not.toBeInTheDocument();
    expect(screen.getByText('FORM')).toBeInTheDocument();
  });

  it('swaps the collapsed line for the picker when a known date is being edited', () => {
    render(
      <DrawerDateRow
        label="Check-in" precision="exact" valueLabel="Sep 26" checkoutLabel="Sep 28"
        onEdit={() => {}} editOpen editForm={<div>FORM</div>}
      />,
    );
    expect(screen.queryByText(/Check-in: Sep 26/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Check-out/)).not.toBeInTheDocument();
    expect(screen.getByText('FORM')).toBeInTheDocument();
  });

  it('calls onEdit from either affordance', async () => {
    const onEdit = vi.fn();
    const { rerender } = render(
      <DrawerDateRow label="Check-in" precision="exact" valueLabel="Sep 26" onEdit={onEdit} editOpen={false} editForm={null} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    rerender(<DrawerDateRow label="Check-in" precision="none" valueLabel={null} onEdit={onEdit} editOpen={false} editForm={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a date for this search' }));
    expect(onEdit).toHaveBeenCalledTimes(2);
  });
});

describe('DrawerPartyRow', () => {
  it('renders the party collapsed behind "· Change" once set', () => {
    render(<DrawerPartyRow label="3 adults" onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>} />);
    expect(screen.getByRole('button', { name: /Booking for 3 adults · Change/ })).toBeInTheDocument();
    expect(screen.queryByText('FORM')).not.toBeInTheDocument();
  });

  it('renders the "Set travellers" prompt while unset', () => {
    render(<DrawerPartyRow label={null} onEdit={() => {}} editOpen editForm={<div>FORM</div>} />);
    expect(screen.getByRole('button', { name: /Set travellers/ })).toBeInTheDocument();
    expect(screen.getByText('FORM')).toBeInTheDocument();
  });
});
