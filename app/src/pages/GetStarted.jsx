import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/entry.css';

export default function GetStarted() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  function route(text) {
    const value = (text ?? input).trim();
    if (!value) return;
    navigate(`/scout-chat?entry=advice&msg=${encodeURIComponent(value)}`);
  }

  return (
    <div className="wrap">
      <div className="entry-hero">
        <span className="eyebrow">✦ Scout &middot; your travel companion</span>
        <h1>Where are we <em>headed</em>?</h1>
        <p className="lede">Answer a few quick questions, or tell Scout the whole trip in your own words. Scout preserves what matters and hands the trip to the right specialist.</p>

        <div className="route-buttons" style={{ gridTemplateColumns: '1fr', maxWidth: 340, margin: '30px auto 0' }}>
          <div className="route-btn" onClick={() => navigate('/plan-trip')}>
            <div className="rb-icon">🗺️</div>
            <div className="rb-t">Plan a trip</div>
            <div className="rb-s">A few quick questions, then the right specialist takes over</div>
          </div>
        </div>

        <div className="or-divider">or just tell Scout</div>

        <div className="ask-box">
          <input
            id="askInput"
            type="text"
            className="ask-input"
            placeholder='Ask a question, or describe your trip — e.g. "Plan my Coorg trip"…'
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
