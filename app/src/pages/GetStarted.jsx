import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/entry.css';

const DOMESTIC_DESTINATIONS = {
  coorg: 'Coorg, Karnataka', goa: 'Goa', manali: 'Manali', kerala: 'Kerala',
  shillong: 'Shillong, Meghalaya', kashmir: 'Kashmir', ladakh: 'Ladakh',
  pondicherry: 'Pondicherry', munnar: 'Munnar, Kerala', ooty: 'Ooty', rishikesh: 'Rishikesh',
};

function classify(text) {
  const t = text.toLowerCase();
  const foundDest = Object.keys(DOMESTIC_DESTINATIONS).find(d => t.includes(d));
  const adviceWords = ['safe', 'best time', 'weather', 'is it', 'should i carry', 'budget for a'];
  const discoveryWords = ['suggest', 'no idea', 'not sure', 'where to go', 'where should i', 'recommend a destination', 'options for'];
  const planWords = ['plan', 'itinerary', 'book', 'trip to', 'help me plan'];

  const isAdvice = adviceWords.some(w => t.includes(w)) && !planWords.some(w => t.includes(w));
  const wantsPlan = planWords.some(w => t.includes(w));
  const wantsDiscovery = discoveryWords.some(w => t.includes(w));

  if (isAdvice) return 'advice';
  if (foundDest && (wantsPlan || !wantsDiscovery)) return 'decided';
  if (wantsDiscovery && wantsPlan) return 'discover_then_plan';
  if (wantsDiscovery) return 'discover_only';
  if (foundDest) return 'decided';
  return 'discover_then_plan';
}

function findDestination(text) {
  const t = text.toLowerCase();
  let dest = 'Coorg, Karnataka';
  for (const k in DOMESTIC_DESTINATIONS) {
    if (t.includes(k)) dest = DOMESTIC_DESTINATIONS[k];
  }
  return dest;
}

const EXAMPLE_CHIPS = [
  { label: 'Plan my Coorg trip', q: 'Plan my trip to Coorg, Karnataka' },
  { label: 'No idea where to go', q: 'I want a relaxing trip in December but have no idea where to go' },
  { label: 'Just suggest destinations', q: 'Suggest a few beach destinations for a solo trip' },
  { label: 'Is Ladakh safe in winter?', q: 'Is Ladakh safe to visit in December?' },
];

export default function GetStarted() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState(null);

  function route(text) {
    const value = (text ?? input).trim();
    if (!value) return;
    setThinking(true);
    setResult(null);
    setTimeout(() => {
      setThinking(false);
      setResult({ kase: classify(value), text: value });
    }, 700);
  }

  function handleQuickRoute(kind) {
    if (kind === 'decided') {
      setInput('Plan my trip to Coorg, Karnataka');
      route('Plan my trip to Coorg, Karnataka');
    } else if (kind === 'discover') {
      navigate('/trip-details?flow=destinations&next=preview');
    }
    // 'ask' just focuses the input — handled inline below
  }

  return (
    <div className="wrap">
      <div className="entry-hero">
        <span className="eyebrow">✦ Scout &middot; your travel companion</span>
        <h1>Where are we <em>headed</em>?</h1>
        <p className="lede">Tell Scout a destination, a vague idea, or just a question. The research happens here, with the reasoning shown, and the decisions stay yours.</p>

        <div className="route-buttons">
          <div className="route-btn" onClick={() => handleQuickRoute('decided')}>
            <div className="rb-icon">📍</div>
            <div className="rb-t">I know where I'm going</div>
            <div className="rb-s">Straight to planning</div>
          </div>
          <div className="route-btn" onClick={() => handleQuickRoute('discover')}>
            <div className="rb-icon">🧭</div>
            <div className="rb-t">Not sure yet</div>
            <div className="rb-s">Help me find a destination</div>
          </div>
          <div className="route-btn" onClick={() => document.getElementById('askInput')?.focus()}>
            <div className="rb-icon">💬</div>
            <div className="rb-t">Just have a question</div>
            <div className="rb-s">Ask Scout directly</div>
          </div>
        </div>

        <div className="or-divider">or tell Scout in your own words</div>

        <div className="ask-box">
          <input
            id="askInput"
            type="text"
            className="ask-input"
            placeholder='e.g. "Plan my Coorg trip" or "Not sure where to go this Diwali"…'
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') route(); }}
          />
          <button className="ask-send" aria-label="Send" onClick={() => route()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
          </button>
        </div>

        <div className="example-row">
          {EXAMPLE_CHIPS.map(c => (
            <div key={c.label} className="chip" onClick={() => { setInput(c.q); route(c.q); }}>{c.label}</div>
          ))}
        </div>

        {thinking && (
          <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Scout is reading that…</div>
        )}

        {result && <ScoutResult kase={result.kase} text={result.text} onAskSomethingElse={() => { setInput(''); setResult(null); document.getElementById('askInput')?.focus(); }} />}
      </div>
    </div>
  );
}

function ScoutResult({ kase, text, onAskSomethingElse }) {
  if (kase === 'decided') {
    const dest = findDestination(text);
    return (
      <div className="result">
        <div className="bubble-scout">Got it — <b>{dest}</b>. Let's build the plan: places to visit, day-by-day flow, and stays.</div>
        <div className="cta-row">
          <Link className="btn btn-primary" to={`/trip-details?flow=planner&dest=${encodeURIComponent(dest)}`}>Start planning {dest} →</Link>
        </div>
      </div>
    );
  }
  if (kase === 'discover_then_plan') {
    return (
      <div className="result">
        <div className="bubble-scout">No fixed destination yet — no problem. A few quick questions first, then straight into planning once we land on one.</div>
        <div className="cta-row">
          <Link className="btn btn-primary" to="/trip-details?flow=destinations&next=preview">Help me find a destination →</Link>
        </div>
      </div>
    );
  }
  if (kase === 'discover_only') {
    return (
      <div className="result">
        <div className="bubble-scout">Sounds like you just want some ideas for now — happy to shortlist a few, no planning commitment yet.</div>
        <div className="cta-row">
          <Link className="btn btn-primary" to="/trip-details?flow=destinations&next=none">Show me some options →</Link>
        </div>
      </div>
    );
  }
  if (kase === 'advice') {
    return (
      <div className="result">
        <div className="bubble-scout">
          Ladakh is generally safe to visit, but December is deep winter — the Leh-Manali and Srinagar-Leh highways are both closed, so the only way in is by air. Temperatures regularly drop below −15°C overnight.
          <ul className="why-list">
            <li>Book flights into Leh well ahead — winter fares rise fast on the only route available</li>
            <li>Acclimatization matters even more in winter cold — plan a rest day on arrival</li>
          </ul>
        </div>
        <div className="cta-row">
          <Link className="btn btn-primary" to="/trip-details?flow=planner&dest=Ladakh">Want to plan a Ladakh trip? →</Link>
          <span className="btn btn-ghost" onClick={onAskSomethingElse}>Ask something else</span>
        </div>
      </div>
    );
  }
  return null;
}
