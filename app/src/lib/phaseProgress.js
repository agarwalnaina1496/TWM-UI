// TWM-234: a local, three-step progress indicator scoped to whichever
// phase (matching or planning) a trip is currently in -- never a single
// bar spanning the whole trip lifecycle. Showing "step 2 of 7 overall"
// implies one fixed pipeline every trip walks through; this only ever
// says "here's how far along the thing you're doing right now is."
// Returns null once a trip is past both phases (planned/booked/done) --
// nothing left to show local progress for.
const PHASES = {
  matching: { label: 'Matching', steps: ['In conversation', 'Recommended', 'Matched'] },
  planning: { label: 'Planning', steps: ['In conversation', 'Draft ready', 'Ready'] },
};

const STAGE_STEP = {
  matching: { phase: 'matching', step: 0 },
  recommended: { phase: 'matching', step: 1 },
  matched: { phase: 'matching', step: 2 },
  planning: { phase: 'planning', step: 0 },
  plan_ready: { phase: 'planning', step: 1 },
};

export function phaseProgress(view) {
  const stage = view?.lifecycle?.stage;
  const entry = STAGE_STEP[stage];
  if (!entry) return null;
  const phase = PHASES[entry.phase];
  return { label: phase.label, steps: phase.steps, activeStep: entry.step };
}
