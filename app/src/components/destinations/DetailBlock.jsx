import { costIcon } from './matrixView.js';

export default function DetailBlock({ detail }) {
  if (detail.type === 'bullets') {
    return (
      <ul className="detail-checklist">
        {detail.items.map(item => <li key={item}>{item}</li>)}
      </ul>
    );
  }
  if (detail.type === 'facts') {
    return (
      <div className="detail-fact-rows">
        {detail.facts.map(f => (
          <div key={f.label} className="detail-fact-row"><span className="fact-icon">📍</span><span className="detail-fact-label">{f.label}</span><span className="detail-fact-value">{f.value}</span></div>
        ))}
      </div>
    );
  }
  if (detail.type === 'cost_breakdown') {
    const currency = detail.currency === 'INR' ? '₹' : detail.currency;
    const isGroupTotal = detail.items.some(item => item.group);
    return (
      <div className="detail-cost-rows">
        <span className="cost-basis">{isGroupTotal ? 'Total party' : 'Per person'}</span>
        {detail.items.map(item => (
          <div key={item.label} className="detail-cost-row">
            <span className="cost-icon">{costIcon(item.label)}</span>
            <span className="cost-label">{item.label}</span>
            <span className="cost-value">≈{currency}{(item.per_person || item.group).minimum.toLocaleString('en-IN')}–{(item.per_person || item.group).maximum.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
