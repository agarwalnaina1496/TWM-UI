// TWM-132: the real outcome discriminator (resolved / missing_input /
// unsupported_partner / disabled, plus a client-side error/no_action
// fallback) — every state renders safely, never a broken link. A resolved
// action with no external target shows an inert note.
// TWM-196: flight's CTA is always secondary (btn-ghost) so the affiliate
// redirect never visually outranks the API offer content above it.
export default function TrustedActionCta({ option, label, best, secondary = false }) {
  if (option.status === 'resolved' && option.url) {
    return (
      <a className={`btn ${best && !secondary ? 'btn-primary' : 'btn-ghost'}`} href={option.url} target="_blank" rel="noreferrer">{label}</a>
    );
  }
  if (option.status === 'resolved') {
    return <p className="already-booked-note">Live pricing for this isn't available yet.</p>;
  }
  if (option.status === 'error') {
    return <p className="already-booked-note" role="alert">{option.errorMessage}</p>;
  }
  return null;
}
