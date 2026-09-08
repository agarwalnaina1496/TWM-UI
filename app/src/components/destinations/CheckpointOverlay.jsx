import { useEffect, useRef } from 'react';

// TWM-174: a transient overlay over Destinations, shown only when Guide's
// fixed-checklist gate finds one genuinely missing field that Meridian's
// judgment-based gate never needed — not a new screen, not logic embedded
// in Plan Builder. Known facts render as read-only chips; only the single
// missing field is asked.
export default function CheckpointOverlay({ knownFacts, message, value, onChange, onSubmit, busy, error }) {
  const cardRef = useRef(null);
  const inputRef = useRef(null);

  // aria-modal="true" is a promise that focus stays contained — this is a
  // required gate with no dismiss affordance (nothing valid to Escape back
  // to), so: autofocus the input on open and whenever a new field is asked,
  // and trap Tab within the card rather than letting it reach the blurred
  // Destinations content behind the scrim.
  useEffect(() => {
    inputRef.current?.focus();
  }, [message]);

  function onKeyDown(event) {
    if (event.key !== 'Tab') return;
    const focusable = cardRef.current?.querySelectorAll('input:not(:disabled), button:not(:disabled)');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit() {
    if (!value.trim()) return;
    onSubmit();
  }

  return (
    <div className="checkpoint-overlay" role="dialog" aria-modal="true" aria-label="One more thing before we plan">
      <div className="checkpoint-card" ref={cardRef} onKeyDown={onKeyDown}>
        <span className="eyebrow">One more thing</span>
        {knownFacts.length > 0 && (
          <div className="checkpoint-known-facts">
            {knownFacts.map(fact => <span key={fact} className="checkpoint-fact-chip">{fact}</span>)}
          </div>
        )}
        <p className="checkpoint-message">{message || 'Guide needs one more detail before it can propose a plan.'}</p>
        {error && <div className="price-evidence state-unsafe" role="alert">{error}</div>}
        <div className="checkpoint-input-row">
          <input
            ref={inputRef}
            type="text"
            aria-label="Your answer"
            placeholder="Your answer…"
            value={value}
            disabled={busy}
            onChange={event => onChange(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') submit(); }}
          />
          <button type="button" className="btn btn-primary" disabled={busy || !value.trim()} onClick={submit}>Send</button>
        </div>
      </div>
    </div>
  );
}
