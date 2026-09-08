// TWM-173: always present regardless of result state — open comparison or
// refinement with no specific option in mind, distinct from the per-option
// "More like this" qualifier.
export default function RefinementDrawer({ open, onToggle, value, onChange, onSubmit, busy }) {
  return (
    <div className="refinement-drawer">
      <button type="button" className="refinement-toggle" onClick={onToggle} aria-expanded={open}>
        Not quite right? Tell us more <span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="refinement-body">
          <textarea
            className="refinement-input"
            aria-label="Tell us more"
            placeholder="e.g. I'd rather avoid long overnight trains, or I want somewhere quieter…"
            value={value}
            onChange={event => onChange(event.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={busy || !value.trim()}>Send</button>
        </div>
      )}
    </div>
  );
}
