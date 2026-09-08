import StatusPill from '../ui/StatusPill.jsx';
import { OUTCOME_ICON, OUTCOME_TONE, optionLabel } from './matrixView.js';

// TWM-173: criteria (rows) x options (columns) comparison matrix, replacing
// three full-width stacked cards. Clicking an option's header focuses it —
// the detail card below stays in sync with whichever column is focused.
export default function ComparisonMatrix({ criteria, options, focusedKey, onFocus }) {
  return (
    <div className="matrix-wrap">
      <table className="comparison-matrix">
        <thead>
          <tr>
            <th className="matrix-corner" scope="col" />
            {options.map(option => (
              <th key={option.key} className={option.key === focusedKey ? 'focused' : ''} scope="col">
                <button type="button" className="matrix-option-header" onClick={() => onFocus(option.key)} aria-pressed={option.key === focusedKey}>
                  <span className="matrix-option-rank">#{option.rank}</span>
                  <span className="matrix-option-name">{option.name}</span>
                  <span className="matrix-option-type">{optionLabel(option)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {criteria.map(criterion => (
            <tr key={criterion.id}>
              <th className="matrix-criterion-label" scope="row">{criterion.label}</th>
              {options.map(option => {
                const evaluation = option.evaluations.find(ev => ev.criterion_id === criterion.id);
                return (
                  <td key={option.key} className={option.key === focusedKey ? 'focused' : ''}>
                    {evaluation && (
                      <StatusPill tone={OUTCOME_TONE[evaluation.outcome]} icon={OUTCOME_ICON[evaluation.outcome]} variant="outline">
                        {evaluation.outcome.toLowerCase()}
                      </StatusPill>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
