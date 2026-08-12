import { useEffect, useRef, useState } from 'react';

// Escalating copy for a single busy wait — we have no true mid-flight signal
// (Scout -> Meridian/Guide chaining happens inside one backend request), so
// this only reads elapsed time and swaps in a later-stage message to keep a
// longer wait (a chained hand-off) from reading as a stall. Never claims a
// specific agent/step, since we can't know one actually ran.
const STAGES = [
  { afterMs: 0, text: 'Scout is thinking…' },
  { afterMs: 2500, text: 'Still working on it…' },
  { afterMs: 5000, text: 'Almost there…' },
];

export function useThinkingMessage(busy) {
  const [message, setMessage] = useState(STAGES[0].text);
  const timers = useRef([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!busy) {
      setMessage(STAGES[0].text);
      return;
    }
    setMessage(STAGES[0].text);
    timers.current = STAGES.slice(1).map(stage =>
      setTimeout(() => setMessage(stage.text), stage.afterMs)
    );
    return () => timers.current.forEach(clearTimeout);
  }, [busy]);

  return message;
}
