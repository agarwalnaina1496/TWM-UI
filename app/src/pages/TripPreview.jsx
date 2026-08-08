import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/preview.css';

// Fake-backend: stands in for Guide's places-finalization + day-wise plan output.
// Real, destination-specific places (not generic placeholders) — keeps the prototype
// believable even though the itinerary logic behind it is still fixture-driven.
const REAL_PLACE_SETS = {
  'coorg': {
    picked: ['Abbey Falls', "Raja's Seat", 'Namdroling Monastery', 'Coffee estate walk & tasting', 'Dubare Elephant Camp'],
    more: ['Talakaveri', 'Mandalpatti viewpoint', 'Chelavara Falls', 'Iruppu Falls'],
  },
  'goa': {
    picked: ['Fort Aguada', 'Baga Beach', 'Anjuna flea market', 'Basilica of Bom Jesus', 'Chapora Fort sunset'],
    more: ['Dudhsagar Falls', 'Palolem Beach', 'Reis Magos Fort', 'Old Goa churches'],
  },
  'manali': {
    picked: ['Solang Valley', 'Hadimba Temple', 'Old Manali cafes', 'Jogini Falls trek', 'Vashisht hot springs'],
    more: ['Rohtang Pass', 'Naggar Castle', 'Manu Temple', 'Kasol day trip'],
  },
  'kerala': {
    picked: ['Alleppey backwater houseboat', 'Fort Kochi walk', 'Munnar tea gardens', 'Periyar wildlife sanctuary', 'Kathakali performance'],
    more: ['Varkala cliff beach', 'Kumarakom bird sanctuary', 'Thekkady spice plantation', 'Vypin lighthouse'],
  },
  'shillong': {
    picked: ['Elephant Falls', 'Umiam Lake', 'Ward’s Lake', 'Living Root Bridges (Cherrapunji day trip)', 'Police Bazaar'],
    more: ['Mawlynnong village', 'Shillong Peak', 'Dainthlen Falls', 'Laitlum Canyons'],
  },
  'kashmir': {
    picked: ['Dal Lake shikara ride', 'Mughal Gardens', 'Gulmarg Gondola', 'Pahalgam valley', 'Old Srinagar houseboats'],
    more: ['Betaab Valley', 'Sonmarg glacier', 'Shankaracharya Temple', 'Doodhpathri'],
  },
  'ladakh': {
    picked: ['Pangong Tso', 'Leh Palace', 'Magnetic Hill', 'Shanti Stupa', 'Nubra Valley'],
    more: ['Khardung La pass', 'Thiksey Monastery', 'Diskit Monastery', 'Tso Moriri'],
  },
  'pondicherry': {
    picked: ['French Quarter (White Town)', 'Promenade Beach', 'Auroville & Matrimandir', 'Sri Aurobindo Ashram', 'Paradise Beach'],
    more: ['Botanical Garden', 'Serenity Beach', 'Bharathi Park'],
  },
  'munnar': {
    picked: ['Eravikulam National Park', 'Mattupetty Dam', 'Tea Museum', 'Top Station viewpoint', 'Kolukkumalai sunrise trek'],
    more: ['Echo Point', 'Attukad Waterfalls', 'Pothamedu viewpoint'],
  },
  'ooty': {
    picked: ['Ooty Lake', 'Botanical Garden', 'Doddabetta Peak', 'Nilgiri Mountain Railway', 'Rose Garden'],
    more: ['Pykara Falls', 'Avalanche Lake', 'Wax World'],
  },
  'rishikesh': {
    picked: ['Laxman Jhula', 'Triveni Ghat aarti', 'Beatles Ashram', 'River rafting on the Ganges', 'Neer Garh Waterfall'],
    more: ['Kunjapuri Temple sunrise', 'Patna Waterfall', 'Ram Jhula'],
  },
};
const DEFAULT_PLACE_SET = {
  picked: ['Old town walking tour', 'Central viewpoint', 'Local market visit', 'Signature local meal', 'Sunset spot'],
  more: ['Nearby day-trip viewpoint', 'Popular local cafe', 'Riverside walk'],
};

const BUDGET_LABELS = {
  budget: 'Under ₹30,000', mid: '₹30,000–70,000', premium: '₹70,000+', flexible: 'Flexible budget',
};

function formatDateRange(start, end) {
  if (!start) return '';
  const opts = { day: 'numeric', month: 'short' };
  const s = new Date(start).toLocaleDateString('en-IN', opts);
  if (!end || end === start) return s;
  const e = new Date(end).toLocaleDateString('en-IN', opts);
  return `${s} – ${e}`;
}

function buildDays(places, tripLength) {
  const n = Math.max(1, tripLength || 3);
  const days = [];
  for (let d = 1; d <= n; d++) {
    const items = [];
    if (d === 1) {
      items.push({ id: `d${d}a`, text: 'Arrive + check in' });
      const p = places[0];
      if (p) items.push({ id: `d${d}b`, text: p.name });
      days.push({ day: d, title: 'Settle in', items });
    } else if (d === n) {
      items.push({ id: `d${d}a`, text: 'Slow morning' });
      items.push({ id: `d${d}b`, text: 'Depart' });
      days.push({ day: d, title: 'Wind down + depart', items });
    } else {
      const p1 = places[(d - 1) % places.length];
      const p2 = places[d % places.length];
      if (p1) items.push({ id: `d${d}a`, text: p1.name });
      if (p2 && p2 !== p1) items.push({ id: `d${d}b`, text: p2.name });
      if (items.length === 0) items.push({ id: `d${d}a`, text: 'Free time to explore' });
      days.push({ day: d, title: 'Explore', items });
    }
  }
  return days;
}

function fakePlacesAndDays(destination, tripLength) {
  const key = Object.keys(REAL_PLACE_SETS).find(k => destination.toLowerCase().includes(k));
  const set = REAL_PLACE_SETS[key] || DEFAULT_PLACE_SET;
  const places = set.picked.map((name, i) => ({ id: `p${i + 1}`, name }));
  return { places, days: buildDays(places, tripLength) };
}

function moreSuggestions(destination) {
  const key = Object.keys(REAL_PLACE_SETS).find(k => destination.toLowerCase().includes(k));
  const set = REAL_PLACE_SETS[key] || DEFAULT_PLACE_SET;
  return set.more.map((name, i) => ({ id: `s${i + 1}`, name }));
}

// Detects stale fixture places left over from before the destination was set
// (e.g. from an earlier prototype session), so the UI never shows mismatched places.
function placesMatchDestination(places, destination) {
  const key = Object.keys(REAL_PLACE_SETS).find(k => destination.toLowerCase().includes(k));
  const set = REAL_PLACE_SETS[key] || DEFAULT_PLACE_SET;
  return places.length > 0 && places.every(p => set.picked.includes(p.name));
}

export default function TripPreview() {
  const navigate = useNavigate();
  const { trip, updateTrip } = useTrip();
  const [placesApproved, setPlacesApproved] = useState(false);
  const [itineraryApproved, setItineraryApproved] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [scoutOpen, setScoutOpen] = useState(false);
  const [scoutContext, setScoutContext] = useState('');
  const [scoutThread, setScoutThread] = useState([]);
  const [scoutNote, setScoutNote] = useState('');

  useEffect(() => {
    const destination = trip.destination || 'your destination';
    if (trip.places.length === 0 || !placesMatchDestination(trip.places, destination)) {
      const { places, days } = fakePlacesAndDays(destination, trip.tripLength);
      updateTrip({ places, days });
    }
    setSuggestions(moreSuggestions(destination));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removePlace(id) {
    const removed = trip.places.find(p => p.id === id);
    updateTrip({ places: trip.places.filter(p => p.id !== id) });
    if (removed) setSuggestions(prev => [...prev, removed]);
  }

  function addSuggestion(id) {
    const added = suggestions.find(s => s.id === id);
    if (!added) return;
    setSuggestions(prev => prev.filter(s => s.id !== id));
    updateTrip({ places: [...trip.places, added] });
  }

  function removeDayItem(dayNum, itemId) {
    updateTrip({
      days: trip.days.map(d => d.day === dayNum ? { ...d, items: d.items.filter(i => i.id !== itemId) } : d),
    });
  }

  function openScout(context) {
    setScoutContext(context);
    setScoutThread([{ who: 'scout', text: `What would you like to change about ${context}?` }]);
    setScoutNote('');
    setScoutOpen(true);
  }

  function closeScout() {
    setScoutOpen(false);
  }

  function approveItinerary() {
    setItineraryApproved(true);
    navigate('/choose-plan');
  }

  function sendScout() {
    if (!scoutNote.trim()) return;
    const note = scoutNote.trim();
    setScoutThread(prev => [
      ...prev,
      { who: 'user', text: note },
      { who: 'scout', text: "Got it — noted for this prototype. Once this is wired to the real Guide backend, Scout would update the plan here directly." },
    ]);
    setScoutNote('');
  }

  return (
    <div className="wrap">
      <Link className="back-link" to="/scout-chat">&larr; Back to details</Link>
      <h1>{trip.destination || 'Your trip'} <em>| {trip.days.length || 3} Days</em></h1>
      <div className="trip-recap-row">
        <span className="recap-item">🕐 {trip.days.length || 3} Days</span>
        <span className="recap-item">👤 {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}</span>
        <span className="recap-item">₹ Budget: {BUDGET_LABELS[trip.budget] || 'Flexible budget'}</span>
        {trip.departDate ? (
          <span className="recap-item">📅 {formatDateRange(trip.departDate, trip.returnDate)}</span>
        ) : trip.month && trip.month !== 'flexible' && (
          <span className="recap-item">📅 {trip.month}</span>
        )}
        {trip.origin && (
          <span className="recap-item">📍 From {trip.origin}</span>
        )}
        {trip.style && (
          <span className="recap-item">🎯 "{trip.style}"</span>
        )}
      </div>
      <p className="lede" style={{ maxWidth: 'none', whiteSpace: 'nowrap' }}>Approve places first, then shape the day-by-day — nothing here is final until you're ready to move forward.</p>

      <div>
        <div className={`step ${placesApproved ? 'done' : 'active'}`}>
          <div className="step-head"><div className="step-num">1</div><div className="step-title">Places to visit</div></div>
          <div className="day-card">
            <div className="day-card-head">
              <div className="day-card-title">Places to visit</div>
              <span className="change-pill" onClick={() => openScout('Places to visit')}>Change places</span>
            </div>
            <ul className="plan-list">
              {trip.places.map(p => (
                <li key={p.id} className="item-row">
                  <span>{p.name}</span>
                  <span className="mini-btn danger icon-btn" onClick={() => removePlace(p.id)} title="Remove" aria-label="Remove">&minus;</span>
                </li>
              ))}
              {trip.places.length === 0 && <li style={{ color: 'var(--tm)' }}>No places left — ask Scout to suggest some.</li>}
            </ul>
            {suggestions.length > 0 && (
              <div className="suggest-row">
                {suggestions.map(s => (
                  <span key={s.id} className="suggest-chip" onClick={() => addSuggestion(s.id)}>
                    <span className="mini-btn icon-btn" title="Add" aria-label="Add">&#43;</span> {s.name}
                  </span>
                ))}
              </div>
            )}
            {!placesApproved && (
              <div style={{ textAlign: 'right', marginTop: 12 }}>
                <span className="btn btn-primary" onClick={() => setPlacesApproved(true)}>✓ Approve places</span>
              </div>
            )}
          </div>
        </div>

        <div className={`step ${placesApproved ? 'active' : ''}`}>
          <div className="step-head"><div className="step-num">2</div><div className="step-title">Day-by-day itinerary</div></div>

          {trip.days.map(d => (
            <div className="day-card" key={d.day}>
              <div className="day-card-head">
                <div className="day-card-title"><span className="daynum">DAY {d.day}</span> {d.title}</div>
                <span className="change-pill" onClick={() => openScout(`Day ${d.day}`)}>Change day</span>
              </div>
              <ul className="plan-list">
                {d.items.map(item => (
                  <li key={item.id} className="item-row">
                    <span>{item.text}</span>
                    <span className="mini-btn icon-btn" onClick={() => removeDayItem(d.day, item.id)} title="Remove" aria-label="Remove">&minus;</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {placesApproved && !itineraryApproved && (
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <span className="btn btn-primary" onClick={approveItinerary}>✓ Approve itinerary</span>
            </div>
          )}
        </div>
      </div>

      <span className="scout-fab" onClick={() => openScout(trip.destination || 'your trip')} title="Chat with Scout">💬</span>

      {scoutOpen && (
        <>
          <div className="scout-backdrop" onClick={closeScout} />
          <div className="scout-sheet">

            <div className="scout-sheet-head">
              <div className="scout-avatar">S</div>
              <div>
                <div className="scout-name">Scout</div>
                <div className="scout-sub">TravelWithMe assistant</div>
              </div>
              <span className="scout-close" onClick={closeScout} aria-label="Close">&times;</span>
            </div>
            <div className="scout-sheet-body">
              {scoutThread.map((m, i) => (
                <div key={i} className={`scout-bubble ${m.who}`}>{m.text}</div>
              ))}
            </div>
            <div className="scout-sheet-footer">
              <input
                className="field-input"
                placeholder="Type your reply…"
                value={scoutNote}
                onChange={e => setScoutNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendScout(); }}
              />
              <span className="scout-send" onClick={sendScout} aria-label="Send">➤</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
