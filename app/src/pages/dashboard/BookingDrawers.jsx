import TransportDrawer from '../../components/drawers/TransportDrawer.jsx';
import StayDrawer from '../../components/drawers/StayDrawer.jsx';
import { DrawerDateRow, DrawerPartyRow } from '../../components/drawers/DrawerRows.jsx';
import ScheduleDateForm from '../../components/drawers/ScheduleDateForm.jsx';
import TravelerEditForm from '../../components/drawers/TravelerEditForm.jsx';
import { legFromItem, normalizePrefEntity } from '../../lib/booking/legsFromItinerary.js';
import { searchPrefFor, isSearchPrefOverride } from '../../constants/bookingSetup.js';

// TWM-216/TWM-220/TWM-228: renders whichever booking drawer is open, plus the
// two editors that live inside every drawer — the shared party editor (with
// the `set_party` open-gap prompt) and the per-entity search-date field. Both
// drawers render through the same `DrawerRows` components and the same
// `useBookingDrawers` edit state; nothing here is per-drawer.

// A collapsed date label for the drawer's date row: an exact ISO date renders
// "Sep 26", a month renders "October 2026".
function collapsedDateLabel(precision, value) {
  if (!value) return null;
  if (precision === 'month') {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function BookingDrawers({ drawers: d }) {
  const { transportDrawerItem, transportItem, staySegment, stay, stayDrawerSegmentId, days } = d;

  const partyEditForm = (
    <TravelerEditForm
      adults={d.travelerEditAdults}
      setAdults={d.setTravelerEditAdults}
      children={d.travelerEditChildren}
      setChildren={d.setTravelerEditChildren}
      infants={d.travelerEditInfants}
      setInfants={d.setTravelerEditInfants}
      onSubmit={d.submitTravelerEdit}
      onCancel={d.closeTravelerEditForm}
      pending={d.travelerEditPending}
      error={d.travelerEditError}
      gapPrompt={!d.party ? d.openGapPrompt : null}
    />
  );
  const drawerPartyRow = (
    <DrawerPartyRow
      label={d.partyLabel}
      onEdit={d.openTravelerEditForm}
      editOpen={d.travelerEditOpen}
      editForm={partyEditForm}
    />
  );

  const prefEntity = d.prefEditTarget
    ? normalizePrefEntity(d.prefEditTarget.type === 'stay' ? staySegment : transportItem, d.prefEditTarget.type)
    : null;
  const prefEditForm = (
    <ScheduleDateForm
      existing={searchPrefFor(prefEntity)}
      dateLabel={d.prefEditTarget?.type === 'stay' ? 'Check-in date' : 'Leg date'}
      helper="Prefill this one search with a specific date. It does not change your itinerary or any other search."
      value={d.prefEditValue}
      setValue={d.setPrefEditValue}
      onSubmit={d.submitPrefEdit}
      onCancel={d.closePrefEditForm}
      onClear={isSearchPrefOverride(prefEntity) ? d.clearPrefEdit : undefined}
      pending={d.prefEditPending}
      error={d.prefEditError}
    />
  );

  const transportDateRow = transportItem ? (() => {
    const entity = normalizePrefEntity(transportItem, 'transport');
    return (
      <DrawerDateRow
        label="This leg"
        precision={transportItem.date_precision}
        valueLabel={collapsedDateLabel(transportItem.date_precision, transportItem.resolved_date)}
        onEdit={() => d.openPrefEditForm('transport', entity)}
        editOpen={d.prefEditOpen && d.prefEditTarget?.type === 'transport'}
        editForm={prefEditForm}
      />
    );
  })() : null;

  const stayDateRow = staySegment ? (() => {
    const entity = normalizePrefEntity(staySegment, 'stay');
    return (
      <DrawerDateRow
        label="Check-in"
        precision={staySegment.date_precision}
        valueLabel={collapsedDateLabel(
          staySegment.date_precision,
          staySegment.date_precision === 'month' ? staySegment.month : staySegment.checkin_date,
        )}
        checkoutLabel={collapsedDateLabel('exact', staySegment.checkout_date)}
        onEdit={() => d.openPrefEditForm('stay', entity)}
        editOpen={d.prefEditOpen && d.prefEditTarget?.type === 'stay'}
        editForm={prefEditForm}
      />
    );
  })() : null;

  return (
    <>
      {transportDrawerItem && (
        <TransportDrawer
          leg={legFromItem(transportItem || transportDrawerItem)}
          options={d.transportOptions}
          feasibility={d.transportFeasibility}
          loading={d.transportDrawerLoading}
          error={d.transportDrawerError}
          dateRow={transportDateRow}
          partyRow={drawerPartyRow}
          onClose={d.closeTransportDrawer}
        />
      )}
      {stayDrawerSegmentId && stay && (
        <StayDrawer
          stay={stay}
          options={d.stayOptions}
          loading={d.stayDrawerLoading}
          error={d.stayDrawerError}
          stayPriceEstimate={days.find(day => day.day_number === stay.startDayNumber)?.stay_price_estimate}
          dateRow={stayDateRow}
          partyRow={drawerPartyRow}
          onClose={d.closeStayDrawer}
        />
      )}
    </>
  );
}
