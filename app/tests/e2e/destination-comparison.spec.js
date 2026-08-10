import { test, expect } from '@playwright/test';

test('selecting a circuit destination option carries its joined name into trip preview', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await expect(page).toHaveURL(/\/app\/?$/);

  await page.goto('destinations?next=preview');
  await expect(page.getByText('A few that fit well')).toBeVisible();

  const circuitCard = page.locator('.dest-card', { hasText: 'Kochi + Alleppey' });
  await expect(circuitCard.getByText('KOCHI + ALLEPPEY CIRCUIT')).toBeVisible();

  await circuitCard.getByText('Why this one').click();
  await expect(circuitCard.getByText(/houseboat night pushes the daily average up/)).toBeVisible();

  await circuitCard.getByText('Plan this trip →').click();

  await expect(page).toHaveURL(/\/app\/trip-preview/);
  await expect(page.getByRole('heading', { name: /kochi \+ alleppey/i })).toBeVisible();
});

test('More like this and Check prices stay non-committing until Plan this trip', async ({ page }) => {
  await page.goto('login');
  await page.getByText('Continue without login').click();
  await page.goto('destinations?next=preview');
  await expect(page.getByText('A few that fit well')).toBeVisible();

  const circuitCard = page.locator('.dest-card', { hasText: 'Kochi + Alleppey' });
  await circuitCard.getByRole('button', { name: 'More like this' }).click();
  await expect(page.getByText(/Refreshed around Kochi \+ Alleppey/)).toBeVisible();
  await expect(page.locator('.dest-card').first()).toContainText('Kochi + Alleppey');
  await expect(page).toHaveURL(/\/app\/destinations/);

  const refreshedCircuit = page.locator('.dest-card').first();
  await refreshedCircuit.getByRole('button', { name: 'Check prices' }).click();
  await expect(refreshedCircuit.getByText('Partial mock result')).toBeVisible();
  await expect(refreshedCircuit.getByText(/not a live quote or availability guarantee/i)).toBeVisible();
  await expect(page).toHaveURL(/\/app\/destinations/);

  const destinationBeforePlan = await page.evaluate(() => JSON.parse(localStorage.getItem('twm_prototype_state_v1')).trip.destination);
  expect(destinationBeforePlan).toBeNull();

  await refreshedCircuit.getByText('Plan this trip →').click();
  await expect(page).toHaveURL(/\/app\/trip-preview/);
});
