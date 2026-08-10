import { test, expect } from '@playwright/test';

test('Plan Builder revision survives refresh via prototype persistence', async ({ page }) => {
  await page.goto('login');
  await page.evaluate(() => localStorage.setItem('twm_prototype_state_v1', JSON.stringify({
    auth: { loggedIn: false, isGuest: true, name: 'Guest', email: '' },
    trip: {
      destination: { id: 'gwalior-orchha-khajuraho-panna', type: 'circuit', name: 'Madhya Pradesh Heritage and Nature', places: ['Gwalior', 'Orchha', 'Khajuraho', 'Panna'] },
      tripContext: { original_traveler_request: 'exact golden request' },
      travelers: 2,
      tripLength: 14,
    },
  })));

  await page.goto('trip-preview');
  await expect(page.getByText('Duration-only · Day 1–14')).toBeVisible();
  await page.getByLabel('Gwalior days').fill('4');
  await expect(page.getByText('Duration-only · Day 1–15')).toBeVisible();

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')).trip.guidePlan?.summary.duration_days)).toBe(15);
  await page.reload();

  await expect(page.getByText('Duration-only · Day 1–15')).toBeVisible();
  await expect(page.getByText('Guide Plan Builder · Draft revision 2')).toBeVisible();
});
