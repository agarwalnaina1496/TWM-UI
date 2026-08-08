import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/destinations.css';

const BUDGET_LABEL = { budget: 'Under ₹30k', mid: '₹30k–70k', premium: '₹70k+', flexible: 'Flexible budget' };
const STYLE_LABEL = { relaxed: 'Relaxed pace', packed: 'Packed days', nature: 'Nature-first', food: 'Food & culture-led' };

// Fake-backend: stands in for a real Meridian/Matcher recommendation call.
function fakeMatchResults(trip) {
  const styleNote = {
    packed: 'Plenty to pack into busy days',
    nature: 'Nature-first, matches what you picked',
    food: 'Strong food & culture scene',
    relaxed: 'Matches the relaxed, slower pace you picked',
  }[trip.style] || 'Matches the pace you picked';

  const budgetNote = {
    budget: 'Fits comfortably under ₹30,000',
    premium: 'Room to go premium at ₹70,000+',
    mid: 'Fits well within ₹30,000–70,000',
    flexible: 'Works across a flexible budget',
  }[trip.budget] || 'Works across a flexible budget';

  return [
    { name: 'Pondicherry', tag: 'Best overall match', best: true, match: 93, why: [styleNote, budgetNote, 'Short flight + drive from most South Indian cities'] },
    { name: 'Coorg, Karnataka', tag: 'Strong match', best: false, match: 88, why: ['Nature-first, coffee estates, cooler climate', budgetNote] },
    { name: 'Munnar, Kerala', tag: 'Worth a look', best: false, match: 80, why: ['Tea gardens and misty hills for a slower trip', 'Slightly further, but direct-flight friendly'] },
  ];
}

export default function Destinations() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, updateTrip } = useTrip();
  const nextMode = params.get('next') || 'preview'; // 'preview' or 'none'

  const [thinking, setThinking] = useState(true);
  const [results, setResults] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setResults(fakeMatchResults(trip));
      setThinking(false);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pills = [];
  if (trip.origin) pills.push('From ' + trip.origin);
  pills.push(BUDGET_LABEL[trip.budget] || 'Flexible budget', STYLE_LABEL[trip.style] || 'Relaxed pace', `${trip.travelers} ${trip.travelers === 1 ? 'traveler' : 'travelers'}`);
  if (trip.month !== 'flexible') pills.push(trip.month);

  function planThis(name) {
    updateTrip({ destination: name });
    navigate('/trip-preview');
  }

  return (
    <div className="wrap">
      <span className="eyebrow">Destination matcher</span>
      <h1>Let's find <em>your</em> place</h1>
      <p className="lede">Matching against what you just told me — ranked by how well each fits.</p>
      <div className="trip-recap">{pills.map(p => <span key={p} className="recap-pill">{p}</span>)}</div>

      {thinking && (
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Matching destinations to your answers…</div>
      )}

      {!thinking && (
        <div>
          <h2 className="section-title">A few that fit well</h2>
          <p className="lede">Based on what you told me — ranked by how well each matches.</p>
          {results.map(d => (
            <div key={d.name} className={`dest-card${d.best ? ' best' : ''}`}>
              <span className="match-pill">{d.match}% match</span>
              <div className="dest-name">{d.name}</div>
              <div className="dest-tag">{d.tag}</div>
              <ul className="why-list">{d.why.map(w => <li key={w}>{w}</li>)}</ul>
              <div className="dest-actions">
                {nextMode === 'preview'
                  ? <span className="btn btn-primary" onClick={() => planThis(d.name)}>Plan this trip →</span>
                  : <Link className="btn btn-primary" to="/trip-preview" onClick={() => updateTrip({ destination: d.name })}>Want to plan this? →</Link>}
                <Link className="btn btn-ghost" to="/my-trips">Save idea</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
