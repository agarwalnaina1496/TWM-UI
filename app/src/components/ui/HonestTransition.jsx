import { useEffect, useState } from 'react';
import '../../styles/design-system.css';

// TWM-173: an honest step-by-step progress treatment, replacing a generic
// "thinking…" spinner wherever a backend call takes long enough that the
// traveler needs more than a dot-flash to trust something real is
// happening. Deliberately reusable — first wired for the Matching→
// Destinations transition (both the initial Discover trigger and, per
// TWM-174, the Direct-Plan reversal-link trigger should call this same
// component rather than a second copy).
//
// Honesty guarantee: the timer only ever advances through the
// second-to-last step. The final step is never marked "done" by the
// timer — it holds at "active" (pulsing, so a long wait still reads as
// alive rather than frozen) for as long as the real operation takes. The
// caller is the actual completion signal: it unmounts/replaces this
// component once its backend call resolves, so the UI never claims
// finished before the backend actually is. `stepDurationMs` is tunable
// per caller — a long-running wait (e.g. TWM-175's Plan Builder→Dashboard
// arrival, up to ~180s) should pass a slower cadence so the optimistic
// steps don't all clear in the first couple of seconds and then sit idle.
export default function HonestTransition({ steps, label, stepDurationMs = 1100 }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= steps.length - 1) return;
    const timer = setTimeout(() => setActiveIndex(i => Math.min(i + 1, steps.length - 1)), stepDurationMs);
    return () => clearTimeout(timer);
  }, [activeIndex, steps.length, stepDurationMs]);

  return (
    <div className="honest-transition" role="status" aria-label={label}>
      <ul className="honest-transition-steps">
        {steps.map((step, i) => (
          <li key={step} className={i < activeIndex ? 'done' : i === activeIndex ? 'active' : ''}>
            <span className="step-marker" aria-hidden="true">{i < activeIndex ? '✓' : i === activeIndex ? '●' : '○'}</span>
            {step}
          </li>
        ))}
      </ul>
    </div>
  );
}
