import { moneyRange } from '../BudgetBar.jsx';
import TrustedActionCta from './TrustedActionCta.jsx';

const STAY_TIER_LABEL = { budget: 'Budget', mid_range: 'Mid-range', premium: 'Premium' };

function StayOptionCard({ option, best }) {
  return (
    <article className={`stay-option-card${best ? ' picked' : ''}`}>
      {best && <span className="pick-badge">Our pick</span>}
      <strong>{option.name}</strong>
      {option.capability && <span className="stay-option-tag">{option.capability.replace(/_/g, ' ')}</span>}
      {option.capabilityNote && <p>{option.capabilityNote}</p>}
      <TrustedActionCta option={option} label={`${option.ctaLabel || 'Search stays'} ↗`} best={best} />
    </article>
  );
}

export default function StayDrawer({ stay, options, loading, error, stayPriceEstimate, dateRow, partyRow, onClose }) {
  if (!stay) return null;
  return (
    <div className="transport-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="transport-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Stay: ${stay.location}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="transport-drawer-head">
          <h3>{stay.location} · {stay.nights} night{stay.nights === 1 ? '' : 's'}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close stay options">✕</button>
        </div>
        {dateRow}
        {partyRow}
        {stayPriceEstimate && (
          <div className="stay-estimate-block">
            <span className="stay-estimate-label">Non-binding estimate, per night</span>
            <div className="stay-estimate-tiers">
              {stayPriceEstimate.map(tier => (
                <div className="stay-estimate-tier" key={tier.tier}>
                  <span className="stay-option-tag">{STAY_TIER_LABEL[tier.tier] || tier.tier}</span>
                  <strong>{moneyRange(tier.estimated_cost_low, tier.estimated_cost_high)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
        {loading && <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>}
        {error && <p className="already-booked-note" role="alert">{error}</p>}
        {!loading && !error && (
          options?.length ? (
            <div className="stay-options-grid">
              {options.map(option => (
                <StayOptionCard key={option.name} option={option} best={false} />
              ))}
            </div>
          ) : (
            <p className="already-booked-note" role="status">No stay partners available for this location.</p>
          )
        )}
      </aside>
    </div>
  );
}
