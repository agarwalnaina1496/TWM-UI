import { buildFactsPanel } from '../lib/discoverChat.js';

// TWM-173: live-updating facts panel — known fields only, no null/pending
// placeholder rows (matches trip_context's free-form philosophy). Renders
// nothing until at least one field is actually known.
export default function FactsPanel({ tripContext }) {
  const facts = buildFactsPanel(tripContext);
  if (facts.length === 0) return null;
  return (
    <div className="facts-panel" aria-label="What we know so far">
      {facts.map(fact => (
        <span key={fact.key} className="facts-panel-item">{fact.label}: <strong>{fact.value}</strong></span>
      ))}
    </div>
  );
}
