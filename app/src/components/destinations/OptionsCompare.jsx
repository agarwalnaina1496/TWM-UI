import OptionDetailCard from './OptionDetailCard.jsx';
import '../../styles/destinations.css';

// TWM-234: the ranked-options grid plus the "tell us more" refinement
// drawer -- split out of DestinationsPanel to keep that file's complexity
// under the cap.
export default function OptionsCompare({
  outcome, planError, refinementBusy, selectedOption, focusedOption, evidenceOpen,
  focusOption, handleToggleEvidence, planThis, planningId,
  refinementOpen, setRefinementOpen, refinementValue, setRefinementValue, submitRefinement,
}) {
  return (
    <div>
      <h2 className="section-title">A few that fit well</h2>
      <div className="agent-summary-message">
        <span className="agent-summary-badge">Scout</span>
        <p>{outcome.data.message}</p>
      </div>
      {planError && <div className="price-evidence state-unsafe" role="alert">{planError}</div>}

      <div className={`options-grid${refinementBusy ? ' options-busy' : ''}`}>
        {outcome.data.options.map(option => {
          const isSelected = selectedOption && selectedOption.type === option.type && selectedOption.id === option.key;
          const isFocused = option.key === (focusedOption?.key ?? null);
          return (
            <OptionDetailCard
              key={option.key}
              option={option}
              criteria={outcome.data.criteria}
              isSelected={isSelected}
              isFocused={isFocused}
              evidenceOpen={isFocused && evidenceOpen}
              onFocus={() => focusOption(option.key)}
              onToggleEvidence={() => handleToggleEvidence(option)}
              onPlan={() => planThis(option)}
              planning={planningId === option.key}
            />
          );
        })}
      </div>

      <div className="refinement-drawer">
        <button type="button" className="refinement-toggle btn btn-ghost" onClick={() => setRefinementOpen(open => !open)} aria-expanded={refinementOpen}>
          Not quite right? Tell us more <span>{refinementOpen ? '▴' : '▾'}</span>
        </button>
        {refinementOpen && (
          <div className="refinement-body">
            <textarea
              className="refinement-input"
              aria-label="Tell us more"
              placeholder="e.g. I'd rather avoid long overnight trains, or I want somewhere quieter…"
              value={refinementValue}
              onChange={event => setRefinementValue(event.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={submitRefinement} disabled={refinementBusy || !refinementValue.trim()}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
