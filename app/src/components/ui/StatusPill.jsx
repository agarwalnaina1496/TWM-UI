import '../../styles/design-system.css';

// TWM-171: single source of truth for the product's shared status vocabulary
// (match/trade-off/mismatch, verified/general-guidance, confirmed/needs-decision,
// or any future status pair) — 4 tones x 2 shape variants. Screens that need a
// status treatment reach for this instead of hand-rolling another pill/badge.
const TONES = ['positive', 'caution', 'negative', 'neutral'];
const VARIANTS = ['filled', 'outline'];

export default function StatusPill({ tone, variant = 'filled', icon, children }) {
  const safeTone = TONES.includes(tone) ? tone : 'neutral';
  const safeVariant = VARIANTS.includes(variant) ? variant : 'filled';
  return (
    <span className={`status-pill status-pill-${safeVariant} status-pill-${safeTone}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

export { TONES as STATUS_PILL_TONES, VARIANTS as STATUS_PILL_VARIANTS };
