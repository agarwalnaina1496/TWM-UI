import StatusPill from '../ui/StatusPill.jsx';
import { rollupSummary } from '../../lib/recommendationViewModel.js';
import DetailBlock from './DetailBlock.jsx';
import {
  BEEN_BEFORE_OPTIONS, OUTCOME_ICON, OUTCOME_TONE,
  accessFact, criterionIcon, criterionLabel, optionLabel,
} from './matrixView.js';

// TWM-173: collapsed by default — name, type, rank, one-line summary, and
// the single "Plan this trip →" CTA are all immediately visible without
// expanding anything. Full evidence sits behind "See why this fits ▾".
export default function OptionDetailCard({
  option, criteria, isSelected, evidenceOpen, onToggleEvidence, onPlan, planning,
  moreLikeThisQualifier, onQualifierChange, onMoreLikeThis, moreLikeThisBusy,
  beenBefore, onToggleBeenBefore, travelers,
}) {
  const access = accessFact(option);
  return (
    <div className="dest-detail-card">
      {isSelected && <span className="pick-badge">Selected</span>}
      <div className="dest-name">{option.name}</div>
      <div className="dest-tag">{optionLabel(option)} · Rank #{option.rank}</div>
      <p className="dest-summary">{option.summary}</p>
      {access && <div className="decision-facts"><span>{access.value}</span></div>}
      <div className="rollup-summary">{rollupSummary(option.evaluations)}{travelers ? ` for ${travelers}` : ''}</div>

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

      <div className="more-like-this-row">
        <input
          type="text"
          className="more-like-this-input"
          placeholder="Optional: cheaper, closer, slower…"
          aria-label={`Refine ${option.name}`}
          value={moreLikeThisQualifier}
          onChange={event => onQualifierChange(event.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={onMoreLikeThis} disabled={moreLikeThisBusy}>✨ More like this</button>
      </div>

      {/* TWM-173: one consistent literal CTA regardless of state — the
          former three-way "Continue planning"/"Plan this trip"/"Want to
          plan this?" split was implementation-path noise, not a real
          state difference the traveler needed to see. */}
      <div className="dest-actions">
        <button type="button" className="btn btn-primary" onClick={onPlan} disabled={planning}>Plan this trip →</button>
      </div>

      <div className="been-before">
        <span className="been-before-label">Been here before? <em>tell us how it was</em></span>
        <div className="been-before-opts">
          {BEEN_BEFORE_OPTIONS.map(opt => (
            <button type="button" key={opt.id} className={`been-before-pill${beenBefore === opt.id ? ' selected' : ''}`} onClick={() => onToggleBeenBefore(opt.id)}>
              <span>{opt.icon}</span>{opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
