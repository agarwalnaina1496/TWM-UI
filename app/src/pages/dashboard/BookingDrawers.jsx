import TransportDrawer from '../../components/drawers/TransportDrawer.jsx';
import StayDrawer from '../../components/drawers/StayDrawer.jsx';
import { DrawerDateRow, DrawerPartyRow } from '../../components/drawers/DrawerRows.jsx';
import ScheduleDateForm from '../../components/drawers/ScheduleDateForm.jsx';
import TravelerEditForm from '../../components/drawers/TravelerEditForm.jsx';
import { legFromItem, normalizePrefEntity } from '../../lib/booking/legsFromItinerary.js';
import { searchPrefFor } from '../../constants/bookingSetup.js';

// TWM-216/TWM-220: renders whichever booking drawer is open, plus the two
// editors that live inside every drawer — the shared party editor (with the
// `set_party` open-gap prompt) and the per-entity search-date preference.
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
      mode={d.prefEditMode}
      setMode={d.setPrefEditMode}
      value={d.prefEditValue}
      setValue={d.setPrefEditValue}
      onSubmit={d.submitPrefEdit}
      onCancel={d.closePrefEditForm}
      onClear={d.clearPrefEdit}
      pending={d.prefEditPending}
      error={d.prefEditError}
    />
  );

  const transportDateRow = transportItem ? (() => {
    const entity = normalizePrefEntity(transportItem, 'transport');
    return (
      <DrawerDateRow
        label="This leg"
        source={transportItem.date_source}
        precision={transportItem.date_precision}
        valueLabel={transportItem.resolved_date}
        editable={transportItem.date_source !== 'trip_dates'}
        onEdit={() => d.openPrefEditForm('transport', entity, 'exact')}
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
        source={staySegment.date_source}
        precision={staySegment.date_precision}
        valueLabel={staySegment.date_precision === 'month' ? staySegment.month : staySegment.checkin_date}
        checkoutLabel={staySegment.checkout_date}
        editable={staySegment.date_source !== 'trip_dates'}
        onEdit={() => d.openPrefEditForm('stay', entity, 'exact')}
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
