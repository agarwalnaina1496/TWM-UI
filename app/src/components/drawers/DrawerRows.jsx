// TWM-216: the booking drawer's search card — one white panel with a row per
// search input (Where / Dates / Guests), each collapsed to a value + a
// "Change" link and expanding in place to its editor. Mirrors a standard OTA
// search form; the only fixed input is Where (it is this itinerary item).

function EditLink({ onEdit, children = 'Change' }) {
  return (
    <button type="button" className="booking-search-change" onClick={onEdit}>{children}</button>
  );
}

// Where — fixed. The destination/route comes from the itinerary and is not
// editable (an editable destination would make this a generic search module).
export function DrawerWhereRow({ value }) {
  return (
    <div className="booking-search-row">
      <div className="booking-search-line">
        <span className="booking-search-label">📍 Where</span>
        <span className="booking-search-value">{value}</span>
        <span className="booking-search-note">from your itinerary</span>
      </div>
    </div>
  );
}

// Dates — collapsed to a check-in → check-out range (exact) or a month label.
// Editing swaps the line for the date form (`editForm`). A genuinely dateless
// entity opens straight into the form.
export function DrawerDateRow({ label = 'Dates', precision, rangeLabel, valueLabel, onEdit, editOpen, editForm }) {
  const known = (precision === 'exact' || precision === 'month') && Boolean(rangeLabel || valueLabel);
  return (
    <div className="booking-search-row">
      {!editOpen && known && (
        <div className="booking-search-line">
          <span className="booking-search-label">📅 {label}</span>
          <span className="booking-search-value">{rangeLabel || valueLabel}</span>
          <EditLink onEdit={onEdit} />
        </div>
      )}
      {!editOpen && !known && (
        <div className="booking-search-line">
          <span className="booking-search-label">📅 {label}</span>
          <EditLink onEdit={onEdit}>Add dates</EditLink>
        </div>
      )}
      {editOpen && editForm}
    </div>
  );
}

// Guests — the trip-wide structured party (booking_setup.party), edited from
// whichever drawer is open. Collapsed once set; "Add guests" while unset.
export function DrawerPartyRow({ label, onEdit, editOpen, editForm }) {
  return (
    <div className="booking-search-row">
      {!editOpen && (
        <div className="booking-search-line">
          <span className="booking-search-label">👤 Guests</span>
          {label
            ? <><span className="booking-search-value">{label}</span><EditLink onEdit={onEdit} /></>
            : <EditLink onEdit={onEdit}>Add guests</EditLink>}
        </div>
      )}
      {editOpen && editForm}
    </div>
  );
}

// The card wrapper both drawers place their rows in.
export function DrawerSearchCard({ children }) {
  return <div className="booking-search-card">{children}</div>;
}
