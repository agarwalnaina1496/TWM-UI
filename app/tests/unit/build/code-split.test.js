import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// TWM-219: guards the route code-split + stable vendor chunk. A structural
// check on source (a full `vite build` assertion would be prohibitively slow
// in the unit suite); the build itself runs as its own CI step.
const read = rel => readFileSync(resolve(import.meta.dirname, '../../..', rel), 'utf8');

describe('route code-split', () => {
  const app = read('src/App.jsx');

  it('lazy-loads every non-landing route page', () => {
    for (const page of ['ScoutChat', 'Destinations', 'TripPreview', 'RequestQuote', 'Support', 'TripDashboard']) {
      expect(app).toMatch(new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(`));
    }
  });

  it('keeps DashboardHome (the / landing) eager', () => {
    expect(app).toMatch(/import DashboardHome from '\.\/pages\/DashboardHome\.jsx'/);
    expect(app).not.toMatch(/const DashboardHome = lazy/);
  });

  it('wraps the routes in a Suspense boundary', () => {
    expect(app).toMatch(/<Suspense fallback=\{<RouteFallback \/>}>[\s\S]*<Routes>/);
  });
});

describe('vendor chunk', () => {
  it('splits the framework into a stable `vendor` chunk', () => {
    const config = read('vite.config.js');
    expect(config).toMatch(/manualChunks\(id\)/);
    expect(config).toMatch(/return 'vendor'/);
  });
});
