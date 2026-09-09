import TransportDrawer from '../../components/drawers/TransportDrawer.jsx';
import StayDrawer from '../../components/drawers/StayDrawer.jsx';
import { DrawerDateRow, DrawerPartyRow } from '../../components/drawers/DrawerRows.jsx';
import ScheduleDateForm from '../../components/drawers/ScheduleDateForm.jsx';
import TravelerEditForm from '../../components/drawers/TravelerEditForm.jsx';
import { legFromItem, normalizePrefEntity } from '../../lib/booking/legsFromItinerary.js';
import { monthLabel, dayLabel } from '../../lib/booking/dateLabels.js';
import { searchPrefFor, isSearchPrefOverride } from '../../constants/bookingSetup.js';

// TWM-216/TWM-220/TWM-228: renders whichever booking drawer is open, plus the
// two editors that live inside every drawer — the shared party editor (with
// the `set_party` open-gap prompt) and the per-entity search-date field. Both
// drawers render through the same `DrawerRows` components and the same
// `useBookingDrawers` edit state; nothing here is per-drawer.

// The collapsed label for one normalized entity ({ precision, date, month }):
// an exact date renders "Sep 26", a month renders "October 2026".
function collapsedDateLabel(entity) {
  if (!entity) return null;
  if (entity.precision === 'month') return monthLabel(entity.month);
  if (entity.precision === 'exact') return dayLabel(entity.date);
  return null;
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
        precision={entity.precision}
        valueLabel={collapsedDateLabel(entity)}
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
        precision={entity.precision}
        valueLabel={collapsedDateLabel(entity)}
        checkoutLabel={dayLabel(staySegment.checkout_date)}
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
          leg={d.transportLeg || legFromItem(transportItem || transportDrawerItem)}
          hubs={d.transportHubs}
          selectedHubCity={d.selectedHubCity}
          onSelectHub={d.selectHub}
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
