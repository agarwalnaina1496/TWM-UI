import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// TWM-221 architectural fitness function (the oxlint-equivalent of an ESLint
// boundary rule — see TWM-UI/AGENTS.md). A module under src/lib/ or
// src/components/ must render from a *composed read model* — a TripView
// (`useQuery(['trip', id])` / `useCurrentTrip`), the matcher round, or the
// enriched `/itinerary` document — never from raw canonical `trip_state`
// branch paths. Backend owns trip_state; the client only ever sees what the
// composer/document surface hands it.
const SCAN_ROOTS = ['src/lib', 'src/components'];

// These legitimately read a self-describing *document* (the enriched
// /itinerary result) or *round* shape, not raw trip_state.
const ALLOW_LIST = new Set([
  'src/lib/booking/legsFromItinerary.js',
  'src/lib/recommendationViewModel.js',
]);

const FORBIDDEN = [
  { re: /\btrip_state\b/, label: 'trip_state' },
  { re: /\.planner_state\b/, label: '.planner_state' },
  { re: /\.matcher_state\b/, label: '.matcher_state' },
  { re: /\.trip_context\b/, label: '.trip_context' },
  { re: /final_itinerary\s*[.?[]/, label: 'final_itinerary.<field>' },
  { re: /\bresult\.unresolved\b/, label: 'result.unresolved' },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
}

describe('trip_state boundary (architectural fitness function)', () => {
  const appRoot = join(import.meta.dirname, '..', '..', '..');

  const files = SCAN_ROOTS.flatMap(root => walk(join(appRoot, root)));

  it('scans a non-trivial number of modules', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('no lib/ or components/ module reads raw trip_state branch paths', () => {
    const violations = [];
    for (const file of files) {
      const rel = relative(appRoot, file).replace(/\\/g, '/');
      if (ALLOW_LIST.has(rel)) continue;
      const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      for (const { re, label } of FORBIDDEN) {
        if (re.test(code)) violations.push(`${rel} → ${label}`);
      }
    }
    expect(violations, `Raw trip_state access outside the composed read model:\n${violations.join('\n')}`).toEqual([]);
  });
});
