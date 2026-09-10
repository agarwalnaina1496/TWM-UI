import { moneyRange } from '../BudgetBar.jsx';
import BookingDrawer from './BookingDrawer.jsx';
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

function StayEstimateBand({ tiers }) {
  return (
    <div className="stay-estimate-block">
      <span className="stay-estimate-label">Rough nightly rate · not a quote</span>
      <div className="stay-estimate-tiers">
        {tiers.map(tier => (
          <div className="stay-estimate-tier" key={tier.tier}>
            <span className="stay-option-tag">{STAY_TIER_LABEL[tier.tier] || tier.tier}</span>
            <strong>{moneyRange(tier.estimated_cost_low, tier.estimated_cost_high)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StayDrawer({ stay, options, loading, error, stayPriceEstimate, searchCard, onClose }) {
  if (!stay) return null;
  return (
    <BookingDrawer
      ariaLabel={`Stay: ${stay.location}`}
      closeLabel="Close stay options"
      title={stay.location}
      meta={`${stay.nights} night${stay.nights === 1 ? '' : 's'}`}
      searchCard={searchCard}
      contextBand={stayPriceEstimate ? <StayEstimateBand tiers={stayPriceEstimate} /> : null}
      sectionHeading="Where to book"
      onClose={onClose}
    >
      {loading && <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Loading options…</div>}
      {error && <p className="already-booked-note" role="alert">{error}</p>}
      {!loading && !error && (
        options?.length ? (
          <div className="stay-options-grid">
            {options.map(option => <StayOptionCard key={option.name} option={option} />)}
          </div>
        ) : (
          <p className="already-booked-note" role="status">No stay partners available for this location.</p>
        )
      )}
    </BookingDrawer>
  );
}
