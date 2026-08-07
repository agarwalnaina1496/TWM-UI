import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/details.css';

const BUDGET_OPTS = [
  { v: 'budget', emoji: '💰', label: 'Under ₹30,000' },
  { v: 'mid', emoji: '💳', label: '₹30,000–70,000' },
  { v: 'premium', emoji: '✨', label: '₹70,000+' },
  { v: 'flexible', emoji: '🤷', label: 'Flexible' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// So the date picker opens already showing the chosen travel month, instead of today's month.
function firstOfMonth(monthName) {
  const idx = MONTHS.indexOf(monthName);
  if (idx === -1) return '';
  const now = new Date();
  let year = now.getFullYear();
  if (idx < now.getMonth()) year += 1;
  return `${year}-${String(idx + 1).padStart(2, '0')}-01`;
}

function fewDaysAfter(isoDate, days) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const diff = Math.round((new Date(end) - new Date(start)) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}

export default function TripDetails() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, updateTrip } = useTrip();

  const flow = params.get('flow') || 'destinations'; // 'planner' or 'destinations'
  const dest = params.get('dest');
  const next = params.get('next') || 'preview';

  const [origin, setOrigin] = useState(trip.origin);
  const [budget, setBudget] = useState(trip.budget);
  const [style, setStyle] = useState(trip.style);
  const [travelers, setTravelers] = useState(trip.travelers);
  const [month, setMonth] = useState(trip.month);
  const [datesKnown, setDatesKnown] = useState(!!trip.departDate);
  const [departDate, setDepartDate] = useState(trip.departDate);
  const [returnDate, setReturnDate] = useState(trip.returnDate);
  const [tripLength, setTripLength] = useState(trip.tripLength);

  const monthChosen = month !== 'flexible';
  const derivedLength = datesKnown ? daysBetween(departDate, returnDate) : null;
  const effectiveLength = derivedLength || tripLength;

  function setDates(start, end) {
    setDepartDate(start);
    setReturnDate(end);
    const derived = daysBetween(start, end);
    if (derived) setTripLength(derived);
  }

  function continueNext() {
    updateTrip({
      origin: origin.trim(),
      budget, style, travelers, month,
      tripLength: effectiveLength,
      departDate: monthChosen && datesKnown ? departDate : '',
      returnDate: monthChosen && datesKnown ? returnDate : '',
      destination: flow === 'planner' && dest ? dest : trip.destination,
    });

    if (flow === 'planner' && dest) {
      navigate(`/trip-preview?dest=${encodeURIComponent(dest)}`);
    } else {
      navigate(`/destinations?next=${next}`);
    }
  }

  return (
    <div className="wrap">
      <span className="eyebrow">A few details first</span>
      <h1>So the plan actually <em>fits</em></h1>
      <p className="lede">Same handful of questions whether you know where you're going or not — budget, pace, and who's coming shape every recommendation from here.</p>

      {flow === 'planner' && dest ? (
        <div className="dest-locked">
          <div><div className="tag">DESTINATION</div><div className="name">{dest}</div></div>
        </div>
      ) : (
        <div className="dest-note">No destination yet — that's the next step. These answers are what Scout will match destinations against.</div>
      )}

      <div className="field-block">
        <div className="field-title">Where are you starting from?</div>
        <div className="field-hint">Used for travel time and route planning</div>
        <input type="text" className="field-input" placeholder="e.g. Bengaluru" value={origin} onChange={e => setOrigin(e.target.value)} />
      </div>

      <div className="field-block">
        <div className="field-title">Roughly what's the budget?</div>
        <div className="field-hint">Per person, all-in</div>
        <div className="opt-grid">
          {BUDGET_OPTS.map(o => (
            <div key={o.v} className={`opt${budget === o.v ? ' selected' : ''}`} onClick={() => setBudget(o.v)}>
              <span className="emoji">{o.emoji}</span><span className="lbl">{o.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="field-block">
        <div className="field-title">What's the goal for this trip?</div>
        <div className="field-hint">In your own words — relaxing, adventure, food, a bit of everything…</div>
        <textarea
          className="field-input"
          rows={3}
          placeholder="e.g. Slow, relaxing trip with good food and no rushing between places"
          value={style}
          onChange={e => setStyle(e.target.value)}
        />
      </div>

      <div className="search-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 26 }}>
        <div className="field-block" style={{ marginBottom: 0 }}>
          <div className="field-title">Number of travelers</div>
          <div className="stepper">
            <button onClick={() => setTravelers(t => Math.max(1, t - 1))}>−</button>
            <div className="count">{travelers} {travelers === 1 ? 'traveler' : 'travelers'}</div>
            <button onClick={() => setTravelers(t => Math.min(10, t + 1))}>+</button>
          </div>
        </div>

        <div className="field-block" style={{ marginBottom: 0 }}>
          <div className="field-title">How many days?</div>
          {monthChosen && datesKnown ? (
            <div className="count" style={{ marginTop: 8 }}>{effectiveLength} {effectiveLength === 1 ? 'day' : 'days'}</div>
          ) : (
            <div className="stepper">
              <button onClick={() => setTripLength(d => Math.max(1, d - 1))}>−</button>
              <div className="count">{tripLength} {tripLength === 1 ? 'day' : 'days'}</div>
              <button onClick={() => setTripLength(d => Math.min(20, d + 1))}>+</button>
            </div>
          )}
        </div>
      </div>

      <div className="field-block">
        <div className="field-title">Travel month</div>
        <select className="field-input" value={month} onChange={e => {
          const v = e.target.value;
          setMonth(v);
          if (datesKnown && v !== 'flexible') {
            const start = firstOfMonth(v);
            setDates(start, fewDaysAfter(start, tripLength - 1));
          }
        }}>
          <option value="flexible">Flexible / not sure yet</option>
          {MONTHS.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {monthChosen && (
        <div className="field-block">
          <div className="field-title">Do you have exact dates in {month}?</div>
          <div className="opt-grid" style={{ marginBottom: datesKnown ? 14 : 0 }}>
            <div className={`opt${datesKnown ? ' selected' : ''}`} onClick={() => {
              setDatesKnown(true);
              if (!departDate) {
                const start = firstOfMonth(month);
                setDates(start, returnDate || fewDaysAfter(start, tripLength - 1));
              }
            }}>
              <span className="emoji">📅</span><span className="lbl">Yes, I know my dates</span>
            </div>
            <div className={`opt${!datesKnown ? ' selected' : ''}`} onClick={() => setDatesKnown(false)}>
              <span className="emoji">🤷</span><span className="lbl">Don't know yet</span>
            </div>
          </div>

          {datesKnown && (
            <div className="search-grid">
              <div>
                <div className="field-label">Trip start</div>
                <input className="field-input" type="date" value={departDate} onChange={e => setDates(e.target.value, returnDate)} />
              </div>
              <div>
                <div className="field-label">Trip end</div>
                <input className="field-input" type="date" value={returnDate} onChange={e => setDates(departDate, e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="continue-row">
        <span className="btn btn-primary" onClick={continueNext}>Continue →</span>
      </div>
    </div>
  );
}
