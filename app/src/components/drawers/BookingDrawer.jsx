// TWM-216: the shared shell both booking drawers render through — a
// right-hand dialog with a fixed slot order: header, the Where/Dates/Guests
// search card, an optional quiet context band (nightly estimate for a stay,
// the gateway note for transport), a section heading, the options list, and
// an optional footer. Stay and transport differ only in what they pass into
// the slots, so the chrome can never drift between them.
export default function BookingDrawer({
  ariaLabel, closeLabel = 'Close', title, meta,
  searchCard, contextBand, sectionHeading, footer, onClose, children,
}) {
  return (
    <div className="transport-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="transport-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={event => event.stopPropagation()}
      >
        <div className="transport-drawer-head">
          <h3>{title}{meta && <span className="drawer-head-meta"> · {meta}</span>}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={closeLabel}>✕</button>
        </div>
        {searchCard}
        {contextBand}
        {sectionHeading && <p className="drawer-section-heading">{sectionHeading}</p>}
        {children}
        {footer}
      </aside>
    </div>
  );
}
