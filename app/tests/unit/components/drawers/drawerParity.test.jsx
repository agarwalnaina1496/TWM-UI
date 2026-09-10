import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import TransportDrawer from '../../../../src/components/drawers/TransportDrawer.jsx';
import StayDrawer from '../../../../src/components/drawers/StayDrawer.jsx';
import {
  DrawerWhereRow, DrawerDateRow, DrawerPartyRow, DrawerSearchCard,
} from '../../../../src/components/drawers/DrawerRows.jsx';

// TWM-216: both booking drawers render one `searchCard` — the same
// Where / Dates / Guests panel. This guards against one drawer wrapping,
// relabelling, or otherwise diverging the shared card.
describe('transport and stay drawers render the shared search card identically', () => {
  const card = (
    <DrawerSearchCard>
      <DrawerWhereRow value="Goa" />
      <DrawerDateRow precision="exact" rangeLabel="Fri, 26 Sep → Sun, 28 Sep 2026"
        onEdit={() => {}} editOpen={false} editForm={null} />
      <DrawerPartyRow label="3 adults" onEdit={() => {}} editOpen={false} editForm={null} />
    </DrawerSearchCard>
  );

  function cardText(container) {
    return container.querySelector('.booking-search-card')?.textContent.trim();
  }

  it('produces the same search-card text in both drawers', () => {
    const transport = render(
      <TransportDrawer leg={{ from: 'Delhi', to: 'Goa' }} options={[]} feasibility={{ modes: [] }}
        loading={false} error={null} searchCard={card} onClose={() => {}} />,
    );
    const stay = render(
      <StayDrawer stay={{ location: 'Goa', nights: 2, startDayNumber: 1 }} options={[]}
        loading={false} error={null} searchCard={card} onClose={() => {}} />,
    );
    expect(cardText(transport.container)).toEqual(cardText(stay.container));
    expect(cardText(transport.container)).toContain('Fri, 26 Sep → Sun, 28 Sep 2026');
    expect(cardText(transport.container)).toContain('3 adults');
  });

  it('both drawers expose the same Change affordances', () => {
    const transport = render(
      <TransportDrawer leg={{ from: 'Delhi', to: 'Goa' }} options={[]} feasibility={{ modes: [] }}
        loading={false} error={null} searchCard={card} onClose={() => {}} />,
    );
    const stay = render(
      <StayDrawer stay={{ location: 'Goa', nights: 2, startDayNumber: 1 }} options={[]}
        loading={false} error={null} searchCard={card} onClose={() => {}} />,
    );
    for (const view of [transport, stay]) {
      const dialog = within(view.container).getByRole('dialog');
      expect(within(dialog).getAllByRole('button', { name: 'Change' })).toHaveLength(2);
    }
  });
});
