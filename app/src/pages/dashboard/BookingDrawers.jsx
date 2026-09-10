import TransportDrawer from '../../components/drawers/TransportDrawer.jsx';
import StayDrawer from '../../components/drawers/StayDrawer.jsx';
import {
  DrawerWhereRow, DrawerDateRow, DrawerPartyRow, DrawerSearchCard,
} from '../../components/drawers/DrawerRows.jsx';
import ScheduleDateForm from '../../components/drawers/ScheduleDateForm.jsx';
import TravelerEditForm from '../../components/drawers/TravelerEditForm.jsx';
import { legFromItem, normalizePrefEntity } from '../../lib/booking/legsFromItinerary.js';
import { monthLabel, dayLabel, rangeLabel } from '../../lib/booking/dateLabels.js';
import { searchPrefFor, isSearchPrefOverride } from '../../constants/bookingSetup.js';

// TWM-216: renders whichever booking drawer is open. Both drawers take one
// `searchCard` — a Where / Dates / Guests panel built here from the same
// `DrawerRows` components and the same `useBookingDrawers` edit state.

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
  const partyRow = rowLabel => (
    <DrawerPartyRow
      rowLabel={rowLabel}
      label={d.partyLabel}
      onEdit={d.openTravelerEditForm}
      editOpen={d.travelerEditOpen}
      editForm={partyEditForm}
    />
  );

  const isStayPref = d.prefEditTarget?.type === 'stay';
  const prefEntity = d.prefEditTarget
    ? normalizePrefEntity(isStayPref ? staySegment : transportItem, d.prefEditTarget.type)
    : null;
  const prefEditForm = (
    <ScheduleDateForm
      existing={searchPrefFor(prefEntity)}
      dateLabel={isStayPref ? 'Check-in' : 'Date'}
      helper={isStayPref ? undefined
        : 'Prefill this one search with a specific date. It does not change your itinerary or any other search.'}
      value={d.prefEditValue}
      setValue={d.setPrefEditValue}
      showCheckout={isStayPref}
      checkoutValue={d.prefEditCheckoutValue}
      setCheckoutValue={d.setPrefEditCheckoutValue}
      itineraryNights={staySegment?.nights}
      onSubmit={d.submitPrefEdit}
      onCancel={d.closePrefEditForm}
      onClear={isSearchPrefOverride(prefEntity) ? d.clearPrefEdit : undefined}
      pending={d.prefEditPending}
      error={d.prefEditError}
    />
  );

  const transportSearchCard = transportItem ? (() => {
    const entity = normalizePrefEntity(transportItem, 'transport');
    const leg = d.transportLeg || legFromItem(transportItem);
    return (
      <DrawerSearchCard>
        <DrawerWhereRow label="Route" value={`${leg.from} → ${leg.to}`} />
        <DrawerDateRow
          label="Date"
          precision={entity.precision}
          valueLabel={collapsedDateLabel(entity)}
          onEdit={() => d.openPrefEditForm('transport', entity)}
          editOpen={d.prefEditOpen && d.prefEditTarget?.type === 'transport'}
          editForm={prefEditForm}
        />
        {partyRow('Travellers')}
      </DrawerSearchCard>
    );
  })() : null;

  const staySearchCard = staySegment ? (() => {
    const entity = normalizePrefEntity(staySegment, 'stay');
    const range = entity.precision === 'exact'
      ? rangeLabel(staySegment.checkin_date, staySegment.checkout_date)
      : null;
    return (
      <DrawerSearchCard>
        <DrawerWhereRow value={stay?.location} />
        <DrawerDateRow
          label="Dates"
          precision={entity.precision}
          rangeLabel={range}
          valueLabel={collapsedDateLabel(entity)}
          onEdit={() => d.openPrefEditForm('stay', entity)}
          editOpen={d.prefEditOpen && d.prefEditTarget?.type === 'stay'}
          editForm={prefEditForm}
        />
        {partyRow('Guests')}
      </DrawerSearchCard>
    );
  })() : null;

  return (
    <>
      {transportDrawerItem && (
        <TransportDrawer
          leg={d.transportLeg || legFromItem(transportItem || transportDrawerItem)}
          modeOptions={d.transportModeOptions}
          selectedMode={d.selectedTransportMode}
          onSelectMode={d.selectTransportMode}
          onBack={d.clearSelectedTransportMode}
          hubs={d.selectedTransportMode ? d.transportModeHubs : d.transportHubs}
          selectedHub={d.selectedHub}
          autoOriginHub={d.autoOriginHub}
          onSelectHub={d.selectHub}
          options={d.transportOptions}
          feasibility={d.transportFeasibility}
          loading={d.transportDrawerLoading}
          error={d.transportDrawerError}
          searchCard={transportSearchCard}
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
          searchCard={staySearchCard}
          onClose={d.closeStayDrawer}
        />
      )}
    </>
  );
}
