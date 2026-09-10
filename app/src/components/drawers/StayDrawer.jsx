import { moneyRange } from '../BudgetBar.jsx';
import TrustedActionCta from './TrustedActionCta.jsx';

const STAY_TIER_LABEL = { budget: 'Budget', mid_range: 'Mid-range', premium: 'Premium' };

// Plain-English capability copy — never the raw enum. `capabilityNote` from
// Backend is already a full sentence; the tag is a short honest summary.
const CAPABILITY_TAG = {
  prefilled_search: { text: 'Dates and guests prefilled', tone: 'sage' },
  destination_search: { text: 'Destination prefilled', tone: 'neutral' },
  destination_redirect: { text: 'Opens the destination — pick dates there', tone: 'neutral' },
};

function StayOptionCard({ option }) {
  const tag = CAPABILITY_TAG[option.capability];
  return (
    <article className="stay-option-card">
      <strong>{option.name}</strong>
      {tag && <span className={`stay-option-tag tone-${tag.tone}`}>{tag.text}</span>}
      {option.capabilityNote && <p>{option.capabilityNote}</p>}
      <TrustedActionCta option={option} label={`${option.ctaLabel || 'Search stays'} ↗`} />
    </article>
  );
}

export default function StayDrawer({ stay, options, loading, error, stayPriceEstimate, searchCard, onClose }) {
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
          <h3>{stay.location} <span className="drawer-head-meta">· {stay.nights} night{stay.nights === 1 ? '' : 's'}</span></h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close stay options">✕</button>
        </div>
        {searchCard}
        {stayPriceEstimate && (
          <div className="stay-estimate-block">
            <span className="stay-estimate-label">Rough nightly rate · not a quote</span>
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
        <p className="drawer-section-heading">Where to book</p>
        {loading && <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>}
        {error && <p className="already-booked-note" role="alert">{error}</p>}
        {!loading && !error && (
          options?.length ? (
            <div className="stay-options-grid">
              {options.map(option => (
                <StayOptionCard key={option.name} option={option} />
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
