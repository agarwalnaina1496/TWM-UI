import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ENTRY_INTENTS } from '../data/entryCommandFixtures.js';
import { trackEvent } from '../lib/analytics.js';
import '../styles/entry.css';

export default function GetStarted() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  function route(text) {
    const value = (text ?? input).trim();
    if (!value) return;
    // The free-text ask box is the current "Advice" entry path — no
    // dedicated Advice button exists in this UX.
    trackEvent('intent_selected', { intent: 'advice' });
    trackEvent('free_text_request_submitted', { entry_point: 'homepage' });
    navigate(`/scout-chat?entry=advice&msg=${encodeURIComponent(value)}`);
  }

  function handleQuickRoute(kind) {
    if (kind === 'decided') {
      trackEvent('intent_selected', { intent: 'plan' });
      navigate(`/journey-entry?intent=${ENTRY_INTENTS.KNOWN_DESTINATION}`);
    } else if (kind === 'discover') {
      trackEvent('intent_selected', { intent: 'discover' });
      navigate(`/journey-entry?intent=${ENTRY_INTENTS.DISCOVER}`);
    }
  }

  return (
    <div className="wrap">
      <div className="entry-hero">
        <span className="eyebrow">✦ Scout &middot; your travel companion</span>
        <h1>Where to <em>next</em>?</h1>
        <p className="lede">Pick how you'd like to start.</p>

        <div className="route-buttons">
          <div className="route-btn" onClick={() => handleQuickRoute('decided')}>
            <div className="rb-icon">📍</div>
            <div className="rb-t">I know my destination</div>
            <div className="rb-s">Jump straight into planning.</div>
          </div>
          <div className="route-btn" onClick={() => handleQuickRoute('discover')}>
            <div className="rb-icon">🧭</div>
            <div className="rb-t">Help me decide</div>
            <div className="rb-s">Get suggestions based on your vibe.</div>
          </div>
        </div>

        <div className="or-divider">or just tell Scout</div>

        <div className="ask-box">
          <input
            id="askInput"
            type="text"
            className="ask-input"
            placeholder='e.g. "Plan my Coorg trip" or "What&apos;s the best time to visit Ladakh?"…'
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
