import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // CI adds the HTML reporter (written, never auto-opened) so a failed run
  // has a report to upload as an artifact — local runs stay list-only.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // `trace: 'on-first-retry'` below has been dead config until now -- no
  // `retries` value was ever set here or in CI, so a retry (and its trace)
  // never happened. Confirmed root cause of the intermittent
  // landing-my-trips "zero trips" flake (and others): passes reliably in
  // isolation, only ever fails under a long full-suite run's resource
  // load, never the same test twice in a row -- a genuine timing flake,
  // not a logic bug. One retry absorbs that class of flake in CI without
  // hiding a real, reproducible failure (which still fails on retry too).
  retries: process.env.CI ? 2 : 1,
  // The flake above is CPU contention, not a per-test bug: `fullyParallel`
  // workers competing with the on-demand Vite dev-server transform on a
  // 2-core CI runner intermittently stall a mid-suite module compile past
  // the 10s assertion timeout — and a run-wide degradation burns all
  // retries at once (seen once on TWM-215's PR: all 3 attempts of "zero
  // trips" failed, then the identical suite passed clean on rerun).
  // Serialising e2e on CI removes that contention; the full suite is
  // ~60-90s sequential, well inside the 15-min job cap. Local runs keep
  // Playwright's default parallelism.
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:5173/app/',
    trace: 'on-first-retry',
  },
  // The default 5s expect() timeout is occasionally too tight for a full
  // sequential run (26+ tests, one browser context each) under real
  // machine load -- confirmed flaky, not a logic bug: the same assertion
  // in the same test intermittently passes/fails at the same position in
  // the suite, only ever under load, never in isolation. 10s gives real
  // load room without masking a genuinely broken assertion.
  expect: { timeout: 10_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/app/',
    reuseExistingServer: !process.env.CI,
  },
});
