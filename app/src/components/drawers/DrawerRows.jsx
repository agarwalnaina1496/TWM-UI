// TWM-216/TWM-228: a drawer's own per-entity search date, presented as a
// standard OTA search field. A known date sits pre-filled and collapsed
// behind a "· Change" affordance; the date picker shows expanded only when
// no date is resolved. There is no date-precision choice — precision is
// settled upstream (trip dates / TWM-227) and this field is exact-only.
export function DrawerDateRow({ label, precision, valueLabel, checkoutLabel, onEdit, editOpen, editForm }) {
  const known = (precision === 'exact' || precision === 'month') && Boolean(valueLabel);
  return (
    <div className="booking-summary-strip">
      {known ? (
        <>
          <p className="transport-drawer-date">
            📅 {label}: {valueLabel}
            {' · '}
            <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>Change</button>
          </p>
          {precision === 'exact' && checkoutLabel && (
            <p className="transport-drawer-date">Check-out {checkoutLabel}</p>
          )}
        </>
      ) : editOpen ? (
        <p className="transport-drawer-date">📅 Add a date for this search</p>
      ) : (
        <div className="booking-summary-row">
          <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>
            Add a date for this search
          </button>
        </div>
      )}
      {editOpen && editForm}
    </div>
  );
}

// TWM-216: the trip-wide structured party (booking_setup.party), edited from
// inside whichever booking drawer is open. Collapsed behind "· Change" once
// set; the "Set travellers" prompt shows only while it is unset.
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
