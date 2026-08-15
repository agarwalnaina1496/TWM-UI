import { useEffect, useState } from 'react';
import '../../styles/design-system.css';

// TWM-173: an honest step-by-step progress treatment, replacing a generic
// "thinking…" spinner wherever a backend call takes long enough that the
// traveler needs more than a dot-flash to trust something real is
// happening. Deliberately reusable — first wired for the Matching→
// Destinations transition (both the initial Discover trigger and, per
// TWM-174, the Direct-Plan reversal-link trigger should call this same
// component rather than a second copy).
export default function HonestTransition({ steps, label }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= steps.length - 1) return;
    const timer = setTimeout(() => setActiveIndex(i => Math.min(i + 1, steps.length - 1)), 1100);
    return () => clearTimeout(timer);
  }, [activeIndex, steps.length]);

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
