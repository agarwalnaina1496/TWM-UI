// TWM-234: collapses DestinationsPanel's long chain of `&&`-guarded render
// conditions into one lookup value -- each condition here runs once instead
// of being repeated (and counted) in every render branch.
export function destinationsPhase({
  showTripLoadError, showRecoError, thinking, triggerError, awaiting, latest, outcome, selectedOption,
}) {
  if (showTripLoadError) return 'trip-error';
  if (outcome?.kind === 'options' && outcome.data) return 'options';
  // A matched trip gets its own screen (destination name + Plan this trip /
  // Compare other destinations) driven only by `selectedOption` -- never
  // gated on the full recommendations round above also having loaded. A
  // matched trip is never "Recommendations unavailable": it already has a
  // destination, so there is nothing missing from its own point of view,
  // even if the richer comparison grid couldn't be refetched.
  if (selectedOption) return 'matched';
  if (showRecoError) return 'reco-error';
  if (thinking) return 'thinking';
  if (triggerError) return 'trigger-error';
  if (awaiting && !latest) return 'awaiting';
  if (outcome?.kind === 'failure') return 'failure';
  if (outcome?.kind === 'options' && outcome.error) return 'options-invalid';
  return 'empty';
}

// Co-located with destinationsPhase since it depends on the same
// grid-vs-matched distinction: the page's subtitle must never promise a
// comparison grid ("compare your options below") that the matched screen
// doesn't actually render.
export function destinationsLede({ outcome, selectedOptionName }) {
  const hasGrid = outcome?.kind === 'options' && Boolean(outcome.data);
  if (hasGrid && selectedOptionName) {
    return `Not ${selectedOptionName} after all? Compare your options below and pick a different one.`;
  }
  if (selectedOptionName) {
    return `Your destination is set: ${selectedOptionName}.`;
  }
  return 'Matching against what you just told me — ranked by how well each fits.';
}
