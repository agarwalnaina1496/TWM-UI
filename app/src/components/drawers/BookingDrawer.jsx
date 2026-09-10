// TWM-216: the shared shell both booking drawers render through — a
// right-hand dialog with a fixed slot order: header, the Where/Dates/Guests
// search card, an optional quiet context band (nightly estimate for a stay,
// the gateway note for transport), a section heading, the options list, and
// an optional footer. Stay and transport differ only in what they pass into
// the slots, so the chrome can never drift between them.
export function DrawerShell({
  ariaLabel, closeLabel = 'Close', title, meta, onBack, onClose, children,
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
          {onBack && <button type="button" className="btn btn-ghost drawer-back" onClick={onBack} aria-label="Back">‹</button>}
          <h3>{title}{meta && <span className="drawer-head-meta"> · {meta}</span>}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={closeLabel}>✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function BookingBody({ searchCard, contextBand, sectionHeading, footer, children }) {
  return (
    <>
      {searchCard}
      {contextBand}
      {sectionHeading && <p className="drawer-section-heading">{sectionHeading}</p>}
      {children}
      {footer}
    </>
  );
}

export default function BookingDrawer({
  ariaLabel, closeLabel = 'Close', title, meta, searchCard, contextBand,
  sectionHeading, footer, onBack, onClose, children,
}) {
  return (
    <DrawerShell
      ariaLabel={ariaLabel}
      closeLabel={closeLabel}
      title={title}
      meta={meta}
      onBack={onBack}
      onClose={onClose}
    >
      <BookingBody
        searchCard={searchCard}
        contextBand={contextBand}
        sectionHeading={sectionHeading}
        footer={footer}
      >
        {children}
      </BookingBody>
    </DrawerShell>
  );
}
