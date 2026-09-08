// TWM-173/TWM-220: live-updating facts panel — renders the server-composed
// context recap (label + value per known field). Renders nothing until at
// least one field is known.
export default function FactsPanel({ contextRecap }) {
  const facts = contextRecap || [];
  if (facts.length === 0) return null;
  return (
    <div className="facts-panel" aria-label="What we know so far">
      {facts.map(fact => (
        <span key={fact.key} className="facts-panel-item">{fact.label}: <strong>{fact.value}</strong></span>
      ))}
    </div>
  );
}
