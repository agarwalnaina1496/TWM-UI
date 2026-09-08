import BudgetBar, { moneyRange } from '../../components/BudgetBar.jsx';
import { BookingReadinessBadge, VerificationTag, VerifyChip } from '../../components/StatusPills.jsx';
import { dayCostRange } from '../../lib/atlasView.js';

const KIND_ICON = { TRAVEL: '🚗', STAY: '🏨', MEAL: '🍽️', FREE_TIME: '🕒' };

export default function ItineraryTab({ days, staySegmentByItemId, activeDay, onSelectDay, onOpenStay, onOpenTransport }) {
  const selectedDay = days.find(day => day.day_number === activeDay) || days[0];
  if (!selectedDay) return null;

  const selectedDayCost = dayCostRange(selectedDay);
  const allCosts = days.flatMap(day => { const range = dayCostRange(day); return [range.low, range.high]; });
  const costMin = Math.min(...allCosts, 0);
  const costMax = Math.max(...allCosts, 1);

  return (
    <section aria-label="Detailed days" className="dashboard-days-wrap">
      <nav className="dashboard-day-nav" aria-label="Select a day">
        {days.map(day => (
          <button type="button" key={day.day_number} className={`dashboard-day-pill${day.day_number === selectedDay.day_number ? ' active' : ''}`} aria-current={day.day_number === selectedDay.day_number ? 'page' : undefined} onClick={() => onSelectDay(day.day_number)}>
            <span className="pill-num">{day.day_number}</span>
            <span className="pill-text"><span className="label">Day {day.day_number}</span><span className="base">{day.primary_location}</span></span>
          </button>
        ))}
      </nav>
      <div className="dashboard-days-main">
        <article className="atlas-day compact">
          <header>
            <span className="atlas-day-eyebrow">Day {String(selectedDay.day_number).padStart(2, '0')} · {days.length} days total</span>
            <h2>{selectedDay.title}</h2>
            <p className="atlas-day-route">📍 {selectedDay.primary_location}</p>
            <p>{selectedDay.summary}</p>
          </header>
          <div className="atlas-timeline">
            {selectedDay.timeline.map(item => {
              const isGatewayLeg = item.kind === 'TRAVEL' && item.is_gateway_leg;
              const staySeg = item.kind === 'STAY' ? staySegmentByItemId[item.id] : null;
              const hasItemActions = isGatewayLeg || staySeg;
              return (
                <div className="atlas-item" key={item.id}>
                  <span className="atlas-dot">{KIND_ICON[item.kind] || '📍'}</span>
                  <div>
                    <time>{item.start_time || 'Flexible'}{item.end_time ? ` – ${item.end_time}` : ''}</time>
                    <div className="item-summary-row">
                      <strong>{item.title}</strong>
                      {moneyRange(item.estimated_cost_low, item.estimated_cost_high) && <span className="item-cost">{moneyRange(item.estimated_cost_low, item.estimated_cost_high)}</span>}
                      <VerificationTag status={item.reference?.status} />
                      <BookingReadinessBadge status={item.booking_readiness} />
                    </div>
                    <p>{item.detail}</p>
                    {item.movement_guidance && <p className="movement-guidance">{item.movement_guidance}</p>}
                    {hasItemActions && (
                      <div className="itinerary-set-dates">
                        {staySeg && (
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => onOpenStay(staySeg.id)}>
                            🏨 Stay options ▾
                          </button>
                        )}
                        {isGatewayLeg && (
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => onOpenTransport(item)}>
                            🚗 Transport options ▾
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {selectedDay.backup_plan && (
            <div className="atlas-day-backup">
              <span className="footer-label">🔁 If plans change</span>
              <p>{selectedDay.backup_plan}</p>
            </div>
          )}
          <div className="atlas-day-footer">
            <div className="footer-budget">
              <span className="footer-label">💰 Estimated for this day</span>
              <strong>{moneyRange(selectedDayCost.low, selectedDayCost.high) || 'Not estimated'}</strong>
              <BudgetBar low={selectedDayCost.low} high={selectedDayCost.high} min={costMin} max={costMax} />
            </div>
            <div className="footer-tips">
              <span className="footer-label">🎒 Good to know</span>
              <ul className="tips-list">
                {(selectedDay.notes || []).map((note, index) => (
                  <li key={index}>
                    <span>•</span>
                    <span><strong>{note.title}</strong> — {note.detail} {note.needs_verification && <VerifyChip />}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
