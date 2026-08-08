import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { classify, findDestination, extractFields, adviceReplyFor } from '../lib/scoutSim.js';
import '../styles/chat.css';

const BUDGET_CHIPS = [
  { label: 'Under ₹30,000', value: 'budget' },
  { label: '₹30,000–70,000', value: 'mid' },
  { label: '₹70,000+', value: 'premium' },
  { label: 'Flexible', value: 'flexible' },
];

const TRAVELER_CHIPS = [
  { label: 'Just me', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 6 },
];

const MONTH_CHIPS = [{ label: 'Flexible / not sure', value: 'flexible' }];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const FIELD_DEFS = {
  destination: { prompt: "Where are you headed?", type: 'text' },
  origin: { prompt: "Where are you starting your journey from?", type: 'text' },
  budget: { prompt: "Roughly what's the budget, per person?", type: 'chips', chips: BUDGET_CHIPS },
  travelers: { prompt: 'How many people are traveling?', type: 'chips', chips: TRAVELER_CHIPS },
  month: { prompt: 'Which month are you thinking of traveling?', type: 'chips', chips: MONTH_CHIPS },
  style: { prompt: "What's the vibe for this trip — relaxing, adventure, food, a bit of everything?", type: 'text' },
};

function titleCase(text) {
  return text.replace(/\b\w/g, c => c.toUpperCase());
}

function parseBudget(text) {
  const t = text.toLowerCase();
  if (t.includes('under 30') || t.includes('cheap') || t.includes('low')) return 'budget';
  if (t.includes('70,000+') || t.includes('70000+') || t.includes('premium') || t.includes('luxury')) return 'premium';
  if (t.includes('30,000') || t.includes('30000') || t.includes('mid')) return 'mid';
  return 'flexible';
}

function parseTravelers(text) {
  const match = text.match(/\d+/);
  if (match) return Math.max(1, Math.min(10, parseInt(match[0], 10)));
  if (/solo/i.test(text)) return 1;
  if (/couple/i.test(text)) return 2;
  return 2;
}

function parseMonth(text) {
  const t = text.toLowerCase();
  const found = MONTHS.find(m => t.includes(m));
  return found ? titleCase(found) : 'flexible';
}

let nextId = 1;

export default function ScoutChat() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, updateTrip } = useTrip();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingField, setPendingField] = useState(null);
  const [queue, setQueue] = useState([]);
  const [headingTo, setHeadingTo] = useState(null); // 'preview' | 'destinations'
  const [nextMode, setNextMode] = useState('preview');
  const [adviceWait, setAdviceWait] = useState(false);
  const [done, setDone] = useState(false);
  const initialized = useRef(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingField]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const entry = params.get('entry');
    const msg = params.get('msg') || '';

    if (entry === 'query' && msg.trim()) {
      say('assistant', "Hey, I'm Scout.");
      handleTravelIntent(msg);
      return;
    }
    if (entry === 'decided') {
      say('assistant', "Great — let's build the plan. First things first:");
      beginQueue({ destinationNeeded: true, headingTo: 'preview', nextMode: 'preview', filled: [] });
      return;
    }
    if (entry === 'discover') {
      say('assistant', "No fixed destination yet — no problem. A few quick questions, then I'll match a few that fit.");
      beginQueue({ destinationNeeded: false, headingTo: 'destinations', nextMode: 'preview', filled: [] });
      return;
    }
    // Reopened from an existing trip (e.g. "Back to details") — everything's already set.
    say('assistant', trip.destination
      ? `You're set for ${trip.destination}. Want to jump back in?`
      : "You're set. Want to jump back in?");
    setHeadingTo(trip.destination ? 'preview' : 'destinations');
    setNextMode('preview');
    setDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function say(role, text, chips = null) {
    setMessages(prev => [...prev, { id: nextId++, role, text, chips }]);
  }

  function beginQueue({ destinationNeeded, headingTo: heading, nextMode: mode, filled }) {
    setHeadingTo(heading);
    setNextMode(mode);
    const order = ['destination', 'origin', 'budget', 'travelers', 'month', 'style'];
    const remaining = order.filter(f => (f !== 'destination' || destinationNeeded) && !filled.includes(f));
    setQueue(remaining);
    askNext(remaining);
  }

  function askNext(remaining) {
    if (!remaining.length) {
      setPendingField(null);
      setDone(true);
      say('assistant', "That's everything I need — here's what I've got. Ready to continue?");
      return;
    }
    const [field, ...rest] = remaining;
    setQueue(rest);
    setPendingField(field);
    const def = FIELD_DEFS[field];
    say('assistant', def.prompt, def.type === 'chips' ? def.chips : null);
  }

  function handleTravelIntent(text) {
    const kase = classify(text);
    if (kase === 'advice') {
      const reply = adviceReplyFor(text);
      say('assistant', reply.message, reply.suggestDestination
        ? [{ label: `Want to plan a trip to ${reply.suggestDestination}?`, value: reply.suggestDestination, kind: 'advice-plan' }]
        : null);
      setAdviceWait(true);
      return;
    }

    const extracted = extractFields(text);
    const filled = [];
    if (kase === 'decided') {
      const destination = findDestination(text) || extracted.destination;
      updateTrip({ destination });
      filled.push('destination');
      say('assistant', `Got it — ${destination}. Let's fill in a few more details so the plan actually fits.`);
      applyExtractedAndBegin(extracted, filled, { destinationNeeded: true, headingTo: 'preview', nextMode: 'preview' });
      return;
    }

    const isDiscoverOnly = kase === 'discover_only';
    say('assistant', isDiscoverOnly
      ? "Sounds like you just want some ideas for now — a few quick questions and I'll shortlist some options."
      : "No fixed destination yet — a few quick questions first, then I'll match a few that fit.");
    applyExtractedAndBegin(extracted, filled, {
      destinationNeeded: false,
      headingTo: 'destinations',
      nextMode: isDiscoverOnly ? 'none' : 'preview',
    });
  }

  function applyExtractedAndBegin(extracted, filledSoFar, { destinationNeeded, headingTo: heading, nextMode: mode }) {
    const patch = {};
    const filled = [...filledSoFar];
    ['origin', 'budget', 'travelers', 'month', 'style'].forEach(f => {
      if (extracted[f] !== undefined) {
        patch[f] = extracted[f];
        filled.push(f);
      }
    });
    if (Object.keys(patch).length) updateTrip(patch);
    beginQueue({ destinationNeeded, headingTo: heading, nextMode: mode, filled });
  }

  function answerField(field, rawValue) {
    let value = rawValue;
    if (field === 'destination') value = titleCase(String(rawValue).trim());
    if (field === 'origin') value = titleCase(String(rawValue).trim());
    if (field === 'budget' && typeof rawValue === 'string' && !['budget', 'mid', 'premium', 'flexible'].includes(rawValue)) value = parseBudget(rawValue);
    if (field === 'travelers' && typeof rawValue !== 'number') value = parseTravelers(String(rawValue));
    if (field === 'month' && typeof rawValue === 'string' && rawValue !== 'flexible' && !MONTHS.includes(rawValue.toLowerCase())) value = parseMonth(rawValue);
    updateTrip({ [field]: value });
    askNext(queue);
  }

  function handleChipClick(chip) {
    if (busy) return;
    if (chip.kind === 'advice-plan') {
      say('user', `Want to plan a trip to ${chip.value}?`);
      setAdviceWait(false);
      const extracted = extractFields(chip.value);
      updateTrip({ destination: chip.value });
      say('assistant', `Let's build the plan for ${chip.value}. A few more details:`);
      applyExtractedAndBegin(extracted, ['destination'], { destinationNeeded: true, headingTo: 'preview', nextMode: 'preview' });
      return;
    }
    say('user', chip.label);
    answerField(pendingField, chip.value);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    say('user', text);

    if (adviceWait) {
      setAdviceWait(false);
      handleTravelIntent(text);
      return;
    }
    if (pendingField) {
      answerField(pendingField, text);
      return;
    }
    // No pending question (e.g. user typed after "done") — treat as a fresh ask.
    handleTravelIntent(text);
  }

  function goContinue() {
    if (headingTo === 'preview') navigate('/trip-preview');
    else navigate(`/destinations?next=${nextMode}`);
  }

  return (
    <div className="wrap chat-page">
      <span className="eyebrow">✦ Scout</span>
      <h1>Let's talk <em>trip</em></h1>

      <div className="chat-log">
        {messages.map(m => (
          <div key={m.id} className={`chat-row chat-row-${m.role}`}>
            <div className={`chat-bub chat-bub-${m.role}`}>{m.text}</div>
            {m.chips && (
              <div className="chat-chip-row">
                {m.chips.map(c => (
                  <span key={c.label} className="chip" onClick={() => handleChipClick(c)}>{c.label}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {done && (
          <div className="chat-row chat-row-assistant">
            <span className="btn btn-primary" onClick={goContinue}>Continue →</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          placeholder="Type your answer…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
        />
        <button className="chat-send" onClick={handleSend} aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></svg>
        </button>
      </div>
    </div>
  );
}
