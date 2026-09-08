// TWM-216: a drawer's own per-entity search date. Writes a per-entity search
// pref (set_search_pref); no trip-level date control exists. Not editable
// when the date came from the itinerary's trip dates.
export function DrawerDateRow({ label, source, precision, valueLabel, checkoutLabel, editable, onEdit, editOpen, editForm }) {
  const known = precision === 'exact' || precision === 'month';
  return (
    <div className="booking-summary-strip">
      <p className="transport-drawer-date">
        📅 {label}: {known ? valueLabel : 'flexible'}
        {source === 'trip_dates' && ' · from your itinerary'}
        {source === 'search_pref' && ' · your search date'}
      </p>
      {checkoutLabel && <p className="transport-drawer-date">Check-out {checkoutLabel}</p>}
      {editable && (
        <div className="booking-summary-row">
          <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>
            {source === 'search_pref' ? 'Change this search date' : 'Add a date for this search'}
          </button>
        </div>
      )}
      {editOpen && editForm}
    </div>
  );
}

// TWM-216: the trip-wide structured party (booking_setup.party), edited from
// inside whichever booking drawer is open.
export function DrawerPartyRow({ label, onEdit, editOpen, editForm }) {
  return (
    <div className="booking-summary-strip">
      <div className="booking-summary-row">
        <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>
          👤 {label ? `Booking for ${label} · Change` : 'Set travellers'}
        </button>
      </div>
      {editOpen && editForm}
    </div>
  );
}
