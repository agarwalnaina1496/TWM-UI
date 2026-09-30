// TWM-234: collapses DestinationsPanel's long chain of `&&`-guarded render
// conditions into one lookup value -- each condition here runs once instead
// of being repeated (and counted) in every render branch.
export function destinationsPhase({ showTripLoadError, showRecoError, thinking, triggerError, awaiting, latest, outcome }) {
  if (showTripLoadError) return 'trip-error';
  if (showRecoError) return 'reco-error';
  if (thinking) return 'thinking';
  if (triggerError) return 'trigger-error';
  if (awaiting && !latest) return 'awaiting';
  if (outcome?.kind === 'failure') return 'failure';
  if (outcome?.kind === 'options' && outcome.error) return 'options-invalid';
  if (outcome?.kind === 'options' && outcome.data) return 'options';
  return 'empty';
}
