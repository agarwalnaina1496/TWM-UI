import { useTrip } from '../context/TripContext.jsx';
import '../styles/design-system.css';

// One-time "your guest trips are now saved" confirmation (TWM-179/180),
// shown immediately after a signup/login that actually reassigned at
// least one trip — reuses the generic checkpoint-overlay shell (TWM-174)
// rather than introducing a new visual pattern.
export default function ClaimConfirmation() {
  const { claimNotice, dismissClaimNotice } = useTrip();
  if (!claimNotice) return null;
  const { count } = claimNotice;

  return (
    <div className="checkpoint-overlay" role="dialog" aria-modal="true" aria-label="Trips saved to your account">
      <div className="checkpoint-card">
        <span className="eyebrow">Saved</span>
        <p className="checkpoint-message">
          {count === 1
            ? 'Your trip is now saved to your account.'
            : `Your ${count} trips are now saved to your account.`}
        </p>
        <span className="btn btn-primary btn-full" onClick={dismissClaimNotice}>Got it →</span>
      </div>
    </div>
  );
}
