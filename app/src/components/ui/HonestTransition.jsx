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
// `activeIndex` lets a caller lift this progress (and the timer that drives
// it) out of the component entirely — e.g. TripDashboard owns the ticking
// itself so it keeps advancing in real wall-clock time regardless of
// whether ItineraryTab is currently mounted, instead of pausing (and
// restarting a step from zero) whenever the traveler tabs away and back.
// Passing `activeIndex` switches this component to purely presentational:
// it renders the given index and runs no timer of its own. Omit it for the
// original self-contained/uncontrolled behavior.
export default function HonestTransition({ steps, label, stepDurationMs = 1100, activeIndex: controlledActiveIndex }) {
  const isControlled = controlledActiveIndex != null;
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const activeIndex = isControlled ? controlledActiveIndex : internalActiveIndex;

  useEffect(() => {
    if (isControlled || activeIndex >= steps.length - 1) return;
    const timer = setTimeout(() => setInternalActiveIndex(i => Math.min(i + 1, steps.length - 1)), stepDurationMs);
    return () => clearTimeout(timer);
  }, [isControlled, activeIndex, steps.length, stepDurationMs]);

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
