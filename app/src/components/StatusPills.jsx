import StatusPill from './ui/StatusPill.jsx';
import { bookingReadinessLabel, verificationTone } from '../lib/atlasView.js';
import { modeLabel } from '../lib/booking/shared.js';

const READINESS_TONE = { suggested: 'positive', needs_advance_booking: 'caution' };
const MODE_ICON = { flight: '✈️', train: '🚆', bus: '🚌', drive: '🚗' };

// Filled shape — a timeline item's booking-readiness axis.
export function BookingReadinessBadge({ status }) {
  if (!status) return null;
  return <StatusPill tone={READINESS_TONE[status] || 'neutral'}>{bookingReadinessLabel(status)}</StatusPill>;
}

// Outline shape — AtlasReference.status (VERIFIED / GENERAL_GUIDANCE).
export function VerificationTag({ status }) {
  if (!status) return null;
  const label = status === 'VERIFIED' ? 'Verified' : 'General guidance';
  return <StatusPill tone={verificationTone(status)} variant="outline">{label}</StatusPill>;
}

// TWM-220: a small inline "worth checking closer to travel" chip — a day note
// with `needs_verification`, or a `before_you_go` item with `verify: true`.
export function VerifyChip() {
  return <StatusPill tone="caution" variant="outline">verify</StatusPill>;
}

export function ModeTag({ mode }) {
  return <StatusPill tone="neutral" variant="outline">{MODE_ICON[mode] || '🧭'} {modeLabel(mode)}</StatusPill>;
}
