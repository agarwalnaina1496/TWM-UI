import PaceMeter from './PaceMeter.jsx';
import './plan-builder.css';

// TWM-234: the day-by-day list -- split out of PlanBuilderPanel to keep
// that file's complexity under the cap.
export default function DayTimeline({ dayPlan, pending, onRemovePlace }) {
  return (
    <section className={`day-timeline${pending ? ' plan-busy' : ''}`} aria-label="Day plan" aria-busy={pending}>
      {dayPlan.map((dayEntry, dayIndex) => (
        <div className="timeline-day" key={dayEntry.day_number}>
          {dayIndex > 0 && <div className="timeline-connector" aria-hidden="true" />}
          <article className="day-card">
            <header className="day-card-head">
              <div className="day-card-title">
                <span className="daynum">{dayEntry.day_number}</span>
                <div><h2>Day {dayEntry.day_number}</h2><PaceMeter pace={dayEntry.pace} /></div>
              </div>
            </header>
            {dayEntry.buffer_note && <p className="buffer-note">{dayEntry.buffer_note}</p>}
            <ol className="plan-list">
              {dayEntry.places.map((place, placeIndex) => (
                <li className="item-row" key={`${dayEntry.day_number}-${place}`}>
                  <span className="place-name">
                    <span className="place-number" aria-hidden="true">{placeIndex + 1}</span>
                    {place}
                  </span>
                  <span className="item-actions">
                    <button type="button" disabled={pending} aria-label={`Remove ${place}`} onClick={() => onRemovePlace(place, dayEntry.day_number)}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      ))}
    </section>
  );
}
