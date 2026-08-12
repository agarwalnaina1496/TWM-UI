// Shared helpers for seeding TripContext's localStorage-backed state in unit tests.
export const STORAGE_KEY = 'twm_prototype_state_v1';

export function seedState({ trip = {}, auth }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ trip, auth }));
}
