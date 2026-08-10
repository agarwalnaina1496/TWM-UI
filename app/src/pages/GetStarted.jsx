import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import '../styles/entry.css';

export default function GetStarted() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  function route(text) {
    const value = (text ?? input).trim();
    if (!value) return;
    navigate(`/scout-chat?entry=advice&msg=${encodeURIComponent(value)}`);
  }

  function handleQuickRoute(kind) {
    if (kind === 'decided') navigate(`/journey-entry?intent=${ENTRY_INTENTS.KNOWN_DESTINATION}`);
    else if (kind === 'discover') navigate(`/journey-entry?intent=${ENTRY_INTENTS.DISCOVER}`);
    else if (kind === 'ask') navigate('/scout-chat?entry=advice');
  }

  return (
    <div className="wrap">
      <div className="entry-hero">
        <span className="eyebrow">✦ Scout &middot; your travel companion</span>
        <h1>Where are we <em>headed</em>?</h1>
        <p className="lede">Choose a direct path, or tell Scout the whole trip in your own words. Scout preserves what matters and hands the trip to the right specialist.</p>

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
          <div className="route-btn" onClick={() => handleQuickRoute('ask')}>
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
      </div>
    </div>
  );
}
