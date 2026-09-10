import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DrawerWhereRow, DrawerDateRow, DrawerPartyRow,
} from '../../../../src/components/drawers/DrawerRows.jsx';

// TWM-216: the booking drawer search card rows — Where (fixed), Dates, Guests.
// Each row collapses to a value + a "Change" link and expands in place.
describe('DrawerWhereRow', () => {
  it('renders the destination with no edit affordance (it is fixed)', () => {
    render(<DrawerWhereRow value="Sumerpur, Rajasthan" />);
    expect(screen.getByText('Sumerpur, Rajasthan')).toBeInTheDocument();
    expect(screen.getByText('from your itinerary')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('DrawerDateRow', () => {
  it('renders an exact date range collapsed behind "Change"', () => {
    render(
      <DrawerDateRow
        precision="exact" rangeLabel="Fri, 26 Sep → Sun, 28 Sep 2026"
        onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>}
      />,
    );
    expect(screen.getByText('Fri, 26 Sep → Sun, 28 Sep 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByText('FORM')).not.toBeInTheDocument();
  });

  it('renders a month-precision label collapsed behind "Change"', () => {
    render(
      <DrawerDateRow
        precision="month" valueLabel="October 2026"
        onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>}
      />,
    );
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('shows a collapsed "Add dates" button when no date is resolved and the form is closed', () => {
    render(
      <DrawerDateRow precision="none" valueLabel={null} onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>} />,
    );
    expect(screen.getByRole('button', { name: 'Add dates' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByText('FORM')).not.toBeInTheDocument();
  });

  it('shows only the picker when the form is open', () => {
    render(
      <DrawerDateRow precision="exact" rangeLabel="Fri, 26 Sep → Sun, 28 Sep 2026" onEdit={() => {}} editOpen editForm={<div>FORM</div>} />,
    );
    expect(screen.queryByText('Fri, 26 Sep → Sun, 28 Sep 2026')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.getByText('FORM')).toBeInTheDocument();
  });

  it('calls onEdit from either affordance', async () => {
    const onEdit = vi.fn();
    const { rerender } = render(
      <DrawerDateRow precision="exact" rangeLabel="Fri, 26 Sep" onEdit={onEdit} editOpen={false} editForm={null} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    rerender(<DrawerDateRow precision="none" valueLabel={null} onEdit={onEdit} editOpen={false} editForm={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add dates' }));
    expect(onEdit).toHaveBeenCalledTimes(2);
  });
});

describe('DrawerPartyRow', () => {
  it('renders the party collapsed behind "Change" once set', () => {
    render(<DrawerPartyRow label="3 adults" onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>} />);
    expect(screen.getByText('3 adults')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByText('FORM')).not.toBeInTheDocument();
  });

  it('renders the "Add guests" prompt while unset', () => {
    render(<DrawerPartyRow label={null} onEdit={() => {}} editOpen editForm={<div>FORM</div>} />);
    expect(screen.getByText('FORM')).toBeInTheDocument();
  });

  it('shows "Add guests" collapsed while unset and the form is closed', () => {
    render(<DrawerPartyRow label={null} onEdit={() => {}} editOpen={false} editForm={<div>FORM</div>} />);
    expect(screen.getByRole('button', { name: 'Add guests' })).toBeInTheDocument();
  });
});
