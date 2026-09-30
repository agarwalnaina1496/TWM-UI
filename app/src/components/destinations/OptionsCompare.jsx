import OptionDetailCard from './OptionDetailCard.jsx';

// TWM-234: the ranked-options grid plus the "tell us more" refinement
// drawer -- split out of DestinationsPanel to keep that file's complexity
// under the cap.
export default function OptionsCompare({
  outcome, planError, refinementBusy, selectedOption, focusedOption, evidenceOpen,
  focusOption, handleToggleEvidence, planThis, planningId, handleMoreLikeThis,
  refinementOpen, setRefinementOpen, refinementScope, setRefinementScope,
  refinementValue, setRefinementValue, submitRefinement,
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
              onMoreLikeThis={() => handleMoreLikeThis(option)}
              moreLikeThisBusy={refinementBusy}
            />
          );
        })}
      </div>

      <div className="refinement-drawer">
        <button type="button" className="refinement-toggle" onClick={() => setRefinementOpen(open => !open)} aria-expanded={refinementOpen}>
          Not quite right? Tell us more <span>{refinementOpen ? '▴' : '▾'}</span>
        </button>
        {refinementOpen && (
          <div className="refinement-body">
            {refinementScope && (
              <div className="refine-scope-pill">
                ✨ Refining relative to <strong>{refinementScope.name}</strong>
                <button type="button" className="refine-scope-clear" onClick={() => setRefinementScope(null)} aria-label="Clear scope">×</button>
              </div>
            )}
            <textarea
              className="refinement-input"
              aria-label="Tell us more"
              placeholder={refinementScope
                ? `e.g. cheaper, closer, slower… (optional)`
                : `e.g. I'd rather avoid long overnight trains, or I want somewhere quieter…`}
              value={refinementValue}
              onChange={event => setRefinementValue(event.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={submitRefinement} disabled={refinementBusy || (!refinementValue.trim() && !refinementScope)}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
