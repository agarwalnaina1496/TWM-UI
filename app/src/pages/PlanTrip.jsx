import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/details.css';
import '../styles/entry.css';

// Fixed, common fields the form collects deterministically — no LLM call —
// before handing off to Meridian/Guide, so neither specialist has to ask for
// them again. Keys match TravelWithMe's ALLOWED_ENTRY_CONTEXT_KEYS
// (twm/schemas/trips.py) exactly; this list is the UI's half of that contract.
const FIELDS = [
  { key: 'origin', label: 'Where are you traveling from?', placeholder: 'e.g. Delhi' },
  { key: 'budget', label: "What's your budget?", placeholder: 'e.g. ₹1,00,000 total, or flexible' },
  { key: 'travelers', label: 'How many travelers?', placeholder: 'e.g. 2' },
  { key: 'duration', label: 'How long is the trip?', placeholder: 'e.g. 5 days' },
  { key: 'travel_window', label: 'When are you thinking of traveling?', placeholder: 'e.g. March 2026, or flexible' },
];

// Every field here is optional — leave anything blank you don't know yet.
export default function PlanTrip() {
  const navigate = useNavigate();
  const { sendTripCommand } = useTrip();
  const [answers, setAnswers] = useState({});
  const [preferences, setPreferences] = useState('');
  const [destinationKnown, setDestinationKnown] = useState(null); // null | true | false
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function setAnswer(key, value) {
    setAnswers(previous => ({ ...previous, [key]: value }));
  }

  function buildTripContext() {
    const tripContext = {};
    for (const field of FIELDS) {
      const value = (answers[field.key] || '').trim();
      if (value) tripContext[field.key] = value;
    }
    return tripContext;
  }

  // Fixed fields go straight into trip_context (deterministic, no LLM).
  // The free-text "anything else" field rides along as `message` — the
  // Backend runs it through Scout purely for extraction and discards
  // Scout's own intent, since discover_entry/known_destination_entry already
  // decided routing (that's the whole point of this form over "own words").
  async function submit() {
    if (destinationKnown === null || busy) return;
    if (destinationKnown && !destination.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const tripContext = buildTripContext();
      const message = preferences.trim() || undefined;
      if (destinationKnown) {
        await sendTripCommand('known_destination_entry', { destination: destination.trim(), tripContext, message });
        navigate('/trip-preview');
      } else {
        await sendTripCommand('discover_entry', { tripContext, message });
        navigate('/destinations?next=preview');
      }
    } catch (commandError) {
      setError(commandError.message || 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="entry-hero" style={{ padding: '32px 0 8px' }}>
        <span className="eyebrow">✦ Scout · your travel companion</span>
        <h1>Let's <em>plan your trip</em></h1>
        <p className="lede">A few quick details — leave anything blank you don't know yet — then Scout brings in the right specialist.</p>
      </div>

      {FIELDS.map(field => (
        <div className="field-block" key={field.key}>
          <div className="field-title">{field.label}</div>
          <input
            className="field-input"
            value={answers[field.key] || ''}
            onChange={event => setAnswer(field.key, event.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      ))}

      <div className="field-block">
        <div className="field-title">Anything else you'd like to mention?</div>
        <textarea
          className="field-input"
          rows={3}
          value={preferences}
          onChange={event => setPreferences(event.target.value)}
          placeholder="Vibe, must-haves, anything Scout should know…"
        />
      </div>

      <div className="field-block">
        <div className="field-title">Do you know where you're going?</div>
        <div className="route-buttons" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginTop: 8 }}>
          <div
            className="route-btn" role="button" tabIndex={0} aria-pressed={destinationKnown === true}
            onClick={() => setDestinationKnown(true)}
            style={destinationKnown === true ? { borderColor: 'var(--accent)' } : undefined}
          >
            <div className="rb-t">Yes, I know</div>
          </div>
          <div
            className="route-btn" role="button" tabIndex={0} aria-pressed={destinationKnown === false}
            onClick={() => setDestinationKnown(false)}
            style={destinationKnown === false ? { borderColor: 'var(--accent)' } : undefined}
          >
            <div className="rb-t">Not yet</div>
          </div>
        </div>
      </div>

      {destinationKnown === true && (
        <div className="field-block">
          <div className="field-title">Where are you going?</div>
          <input
            className="field-input"
            value={destination}
            onChange={event => setDestination(event.target.value)}
            placeholder="e.g. Coorg, Karnataka"
          />
        </div>
      )}

      {error && <div className="price-evidence state-unsafe" role="alert">{error}</div>}

      <span
        className="btn btn-primary btn-full"
        role="button" tabIndex={0}
        onClick={submit}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') submit(); }}
        style={{ opacity: destinationKnown === null || (destinationKnown && !destination.trim()) || busy ? 0.5 : 1 }}
      >
        {busy ? 'Starting…' : 'Continue →'}
      </span>
    </div>
  );
}
