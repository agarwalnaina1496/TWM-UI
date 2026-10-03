import StatusPill from '../../components/ui/StatusPill.jsx';
import { rollupSummary } from '../../lib/recommendationViewModel.js';
import DetailBlock from './DetailBlock.jsx';
import {
  OUTCOME_ICON, OUTCOME_TONE,
  accessFact, criterionIcon, criterionLabel, optionLabel, priceRange,
} from './matrixView.js';

export default function OptionDetailCard({
  option, criteria, isFocused, evidenceOpen, onFocus,
  onToggleEvidence, onChoose, choosing,
}) {
  const access = accessFact(option);
  const price = priceRange(option);
  return (
    <div className={`dest-detail-card${isFocused ? ' focused' : ''}`}>
      <button type="button" className="dest-card-name-btn" onClick={onFocus}>
        {option.name}
      </button>
      <div className="dest-tag">{optionLabel(option)} · Rank #{option.rank}</div>
      {price && <div className="dest-price">{price}</div>}
      <p className="dest-summary">{option.summary}</p>
      {access && <div className="decision-facts"><span>{access.value}</span></div>}
      <div className="rollup-summary">{rollupSummary(option.evaluations)}</div>

      <div className="dest-criteria">
        {option.evaluations.map(ev => (
          <div key={ev.criterion_id} className="dest-criterion-row">
            <span className="dest-criterion-icon">{criterionIcon(ev.criterion_id)}</span>
            <span className="dest-criterion-outcome">{OUTCOME_ICON[ev.outcome]}</span>
            <span className="dest-criterion-text">{ev.conclusion}</span>
          </div>
        ))}
      </div>

      <button type="button" className="reason-toggle" onClick={onToggleEvidence}>
        See why this fits <span>{evidenceOpen ? '▴' : '▾'}</span>
      </button>
      {evidenceOpen && (
        <div className="reason-body open">
          {option.evaluations.map(ev => (
            <div key={ev.criterion_id} className="eval-block">
              <div className="eval-head">
                <span className="eval-icon">{criterionIcon(ev.criterion_id)}</span>
                <span className="eval-conclusion">{criterionLabel(criteria, ev.criterion_id)}: {ev.conclusion}</span>
                <StatusPill tone={OUTCOME_TONE[ev.outcome]} icon={OUTCOME_ICON[ev.outcome]}>{ev.outcome.toLowerCase()}</StatusPill>
              </div>
              {ev.details.map((detail, di) => <DetailBlock key={di} detail={detail} />)}
              {ev.tradeoffs?.map(t => <div key={t} className="eval-tradeoff">⚠ {t}</div>)}
            </div>
          ))}
          {option.other_considerations.length > 0 && (
            <div className="other-considerations">
              <div className="other-considerations-title">Other considerations</div>
              <div className="detail-tags">
                {option.other_considerations.map(o => <span key={o} className="detail-tag">{o}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="dest-actions">
        <button type="button" className="btn btn-ghost" onClick={onChoose} disabled={choosing}>Choose this destination</button>
      </div>
    </div>
  );
}
