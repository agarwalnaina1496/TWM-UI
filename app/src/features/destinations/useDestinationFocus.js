import { useEffect, useRef, useState } from 'react';

// TWM-234: which option card is focused / has its evidence open, restored
// from and persisted to ui_state -- split out of useDestinations
// purely to keep that file's complexity under the cap. `uiState` can arrive
// asynchronously after first render, so a restore effect re-applies it once
// `enabled` + `tripLoadStatus` settle, on top of the initial useState value.
export function useDestinationFocus({ enabled, tripLoadStatus, uiState, updateUiState, focusedKeyStateKey, evidenceOpenStateKey }) {
  const [focusedKey, setFocusedKey] = useState(() => uiState[focusedKeyStateKey] ?? null);
  const [evidenceOpen, setEvidenceOpen] = useState(() => !!uiState[evidenceOpenStateKey]);

  const restored = useRef(false);
  useEffect(() => {
    if (!enabled || restored.current || tripLoadStatus !== 'ready') return;
    restored.current = true;
    if (uiState[focusedKeyStateKey]) setFocusedKey(uiState[focusedKeyStateKey]);
    if (uiState[evidenceOpenStateKey]) setEvidenceOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tripLoadStatus, uiState[focusedKeyStateKey], uiState[evidenceOpenStateKey]]);

  function focusOption(key) {
    if (key === focusedKey) return;
    setFocusedKey(key);
    setEvidenceOpen(false);
    updateUiState({ [focusedKeyStateKey]: key, [evidenceOpenStateKey]: false }).catch(() => {});
  }

  function toggleEvidence(currentKey) {
    const next = !evidenceOpen;
    setEvidenceOpen(next);
    updateUiState({ [focusedKeyStateKey]: currentKey ?? null, [evidenceOpenStateKey]: next }).catch(() => {});
  }

  function handleToggleEvidence(option) {
    if (option.key !== focusedKey) {
      setFocusedKey(option.key);
      setEvidenceOpen(true);
      updateUiState({ [focusedKeyStateKey]: option.key, [evidenceOpenStateKey]: true }).catch(() => {});
    } else {
      toggleEvidence(option.key);
    }
  }

  return { focusedKey, setFocusedKey, evidenceOpen, setEvidenceOpen, focusOption, handleToggleEvidence };
}
