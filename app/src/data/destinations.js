// Shared list of destination keys the fake-backend fixtures recognize,
// so every page's fixture lookup matches the same destination consistently.
export const DEST_KEYS = [
  'coorg', 'goa', 'manali', 'kerala', 'shillong', 'kashmir', 'ladakh',
  'pondicherry', 'munnar', 'ooty', 'rishikesh',
];

export function matchDestinationKey(destination) {
  const d = (destination || '').toLowerCase();
  return DEST_KEYS.find(k => d.includes(k));
}
