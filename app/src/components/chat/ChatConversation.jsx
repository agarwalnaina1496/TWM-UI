import { Fragment, useEffect, useRef, useState } from 'react';
import { QUICK_REPLIES, AWAITING_INPUT_LABELS } from '../../data/entryCommandFixtures.js';
import { didHandoffOccur } from '../../lib/discoverChat.js';
import ErrorBanner from '../ui/ErrorBanner.jsx';
import '../../styles/chat.css';

// TWM-234: the reusable core of a Scout/Meridian/Guide conversation --
// message log, input bar, quick replies, busy/error state, hand-off notes.
// Split out of ScoutChat.jsx so the same conversation can render either as
// that standalone page's content, or embedded directly in Dashboard's
// Overview tab for a trip that's still mid-conversation -- one component,
// two mount points, always in sync. Callers own everything about *how* a
// trip got here (fresh entry vs. resume, which route, intent flavor); this
// component only owns the conversation itself, assuming a trip already
// exists.
//
// `components/` may not import from `hooks/` (TWM-224 layer graph), so the
// thinking-message timer below is a local copy of hooks/useThinkingMessage.js
// rather than an import.
const THINKING_STAGES = [
  { afterMs: 0, text: 'Thinking…' },
  { afterMs: 2500, text: 'Still working on it…' },
  { afterMs: 5000, text: 'Almost there…' },
];

function useThinkingMessage(busy) {
  const [message, setMessage] = useState(THINKING_STAGES[0].text);
  const timers = useRef([]);
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!busy) { setMessage(THINKING_STAGES[0].text); return; }
    setMessage(THINKING_STAGES[0].text);
    timers.current = THINKING_STAGES.slice(1).map(stage => setTimeout(() => setMessage(stage.text), stage.afterMs));
    return () => timers.current.forEach(clearTimeout);
  }, [busy]);
  return message;
}

const HANDOFF_NOTES = {
  meridian: '→ Bringing in Meridian, who handles destination matching.',
  guide: '→ Bringing in Guide, who builds your day-by-day plan.',
};

let nextId = 1;

/**
 * @param {object} props
 * @param {string} props.tripLoadStatus - gates the initial greeting/auto-send until the trip has actually loaded.
 * @param {string|null} props.activeAgent - drives hand-off notes and quick-reply flavor.
 * @param {string|null} [props.stage] - lifecycle stage; only used to decide whether to offer "See destinations →".
 * @param {string|null} props.awaiting - drives quick replies and the input placeholder/label.
 * @param {string[]} [props.greeting] - opening assistant lines shown once, on first ready mount (fresh entries only).
 * @param {string} [props.initialMessage] - a message to auto-send once, on first ready mount (the `?msg=` case).
 * @param {(text: string) => Promise<{message: string}>} props.onSend - dispatches the actual command; caller decides startTrip vs. sendTripCommand.
 * @param {(response: object) => boolean} [props.onPlanReady] - return true to hand off (e.g. navigate) instead of displaying the response.
 * @param {() => void} [props.onSeeDestinations] - if provided, shows a manual "See destinations →" affordance once Meridian has nothing left to ask.
 * @param {{label: string, placeholder: string}} [props.inputLabelOverride] - replaces the awaiting-derived input label/placeholder (the known-destination per-question composer).
 * @param {string} [props.sendLabelOverride] - replaces the send button's accessible label.
 */
export default function ChatConversation({
  tripLoadStatus, activeAgent, stage, awaiting, greeting, initialMessage,
  onSend, onPlanReady, onSeeDestinations, inputLabelOverride, sendLabelOverride,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const initialized = useRef(false);
  const lastCommand = useRef(null);
  const previousAgent = useRef(null);

  function say(role, text) {
    if (text) setMessages(previous => [...previous, { id: nextId++, role, text }]);
  }

  async function runAdvice(message, { showUser = true } = {}) {
    const text = message.trim();
    if (!text || busy) return;
    lastCommand.current = text;
    if (showUser) say('user', text);
    setBusy(true);
    setError(null);
    try {
      const response = await onSend(text);
      if (onPlanReady?.(response)) return;
      say('assistant', response.message);
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialized.current || tripLoadStatus !== 'ready') return;
    initialized.current = true;
    (greeting || []).forEach(line => say('assistant', line));
    if (initialMessage) runAdvice(initialMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLoadStatus]);

  useEffect(() => {
    if (tripLoadStatus !== 'ready') return;
    if (didHandoffOccur(previousAgent.current, activeAgent)) say('system', HANDOFF_NOTES[activeAgent]);
    previousAgent.current = activeAgent;
  }, [tripLoadStatus, activeAgent]);

  function send() {
    const value = input.trim();
    if (!value || busy) return;
    setInput('');
    runAdvice(value);
  }

  const quickReplies = (awaiting === 'anything_else' && activeAgent === 'meridian')
    ? QUICK_REPLIES.anything_else_meridian
    : QUICK_REPLIES[awaiting] || [];
  const thinkingMessage = useThinkingMessage(busy);
  const inputLabel = inputLabelOverride || AWAITING_INPUT_LABELS[awaiting];

  return (
    <Fragment>
      <div className="chat-log" aria-live="polite">
        {messages.map(message => (
          message.role === 'system' ? (
            <div key={message.id} className="chat-row chat-row-system"><span className="chat-system-note">{message.text}</span></div>
          ) : (
            <div key={message.id} className={`chat-row chat-row-${message.role}`}>
              <div className={`chat-bub chat-bub-${message.role}`} style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
            </div>
          )
        ))}
        {busy && <div className="think" role="status">{thinkingMessage}</div>}
        {!busy && quickReplies.length > 0 && (
          <div className="chat-chip-row" aria-label={`Suggested ${awaiting} replies`}>
            {quickReplies.map(reply => <button type="button" className="chip" key={reply} onClick={() => runAdvice(reply)}>{reply}</button>)}
          </div>
        )}
        {error && <ErrorBanner message={error} actionLabel="Try again" onAction={() => runAdvice(lastCommand.current ?? '', { showUser: false })} />}
        {onSeeDestinations && ((activeAgent === 'meridian' && !awaiting) || stage === 'recommended') && (
          <button type="button" className="btn btn-primary" onClick={onSeeDestinations}>See destinations →</button>
        )}
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          aria-label={inputLabel?.label || 'Message Scout'}
          placeholder={inputLabel?.placeholder || 'Message Scout…'}
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') send(); }}
        />
        <button type="button" className="chat-send" onClick={send} disabled={busy} aria-label={sendLabelOverride || 'Send'}>→</button>
      </div>
    </Fragment>
  );
}
