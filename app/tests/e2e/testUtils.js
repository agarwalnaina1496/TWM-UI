// Shared helpers for seeding TripContext's localStorage-backed state in e2e tests.
export const STORAGE_KEY = 'twm_prototype_state_v1';

export async function seedState(page, { trip = {}, auth, savedTrips = [] }) {
  // Land on an in-app page first so localStorage is set on the app's own origin/path.
  await page.goto('login');
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: { trip, auth, savedTrips } }
  );
}
