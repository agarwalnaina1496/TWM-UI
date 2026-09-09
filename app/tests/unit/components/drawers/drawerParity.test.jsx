import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import TransportDrawer from '../../../../src/components/drawers/TransportDrawer.jsx';
import StayDrawer from '../../../../src/components/drawers/StayDrawer.jsx';
import { DrawerDateRow, DrawerPartyRow } from '../../../../src/components/drawers/DrawerRows.jsx';

// TWM-228: both booking drawers render the date + party rows through the same
// shared components. This guards against one drawer wrapping, relabelling, or
// otherwise diverging the shared rows.
describe('transport and stay drawers render the shared rows identically', () => {
  const dateRow = (
    <DrawerDateRow label="Check-in" precision="exact" valueLabel="Sep 26" checkoutLabel="Sep 28"
      onEdit={() => {}} editOpen={false} editForm={null} />
  );
  const partyRow = <DrawerPartyRow label="3 adults" onEdit={() => {}} editOpen={false} editForm={null} />;

  function rowText(container) {
    return [...container.querySelectorAll('.booking-summary-strip')].map(el => el.textContent.trim());
  }

  it('produces the same date/party row text in both drawers', () => {
    const transport = render(
      <TransportDrawer leg={{ from: 'Delhi', to: 'Goa' }} options={[]} feasibility={{ modes: [] }}
        loading={false} error={null} dateRow={dateRow} partyRow={partyRow} onClose={() => {}} />,
    );
    const stay = render(
      <StayDrawer stay={{ location: 'Goa', nights: 2, startDayNumber: 1 }} options={[]}
        loading={false} error={null} dateRow={dateRow} partyRow={partyRow} onClose={() => {}} />,
    );

    const transportRows = rowText(transport.container);
    const stayRows = rowText(stay.container);
    expect(transportRows).toEqual(stayRows);
    expect(transportRows).toEqual([
      expect.stringContaining('Check-in: Sep 26'),
      expect.stringContaining('Booking for 3 adults · Change'),
    ]);
  });

  it('both drawers expose the same Change affordances', () => {
    const transport = render(
      <TransportDrawer leg={{ from: 'Delhi', to: 'Goa' }} options={[]} feasibility={{ modes: [] }}
        loading={false} error={null} dateRow={dateRow} partyRow={partyRow} onClose={() => {}} />,
    );
    const stay = render(
      <StayDrawer stay={{ location: 'Goa', nights: 2, startDayNumber: 1 }} options={[]}
        loading={false} error={null} dateRow={dateRow} partyRow={partyRow} onClose={() => {}} />,
    );
    for (const view of [transport, stay]) {
      const dialog = within(view.container).getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: 'Change' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Booking for 3 adults/ })).toBeInTheDocument();
    }
  });
});
