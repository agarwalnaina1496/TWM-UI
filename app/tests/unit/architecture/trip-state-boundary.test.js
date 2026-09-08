import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// TWM-221 / TWM-224 architectural fitness function — the oxlint has no
// `no-restricted-syntax`, so this stands in for it (see the "Architecture
// rules (enforced)" section of TWM-UI/AGENTS.md). A module under src/lib/ or
// src/components/ must render from a *composed read model* — a TripView
// (`useQuery(['trip', id])`), the matcher round, or the enriched
// `/itinerary` document — never from raw canonical `trip_state` branch
// paths. Backend owns trip_state; the client only ever sees what the
// composer / document surface hands it.
const SCAN_ROOTS = ['src/lib', 'src/components'];

// These legitimately read a self-describing *document* (the enriched
// /itinerary result) or the matcher *round* shape, not raw trip_state.
const ALLOW_LIST = new Set([
  'src/lib/booking/legsFromItinerary.js',
  'src/lib/recommendationViewModel.js',
]);

const FORBIDDEN = [
  { re: /\btrip_state\b/, label: 'trip_state' },
  { re: /\.planner_state\b/, label: '.planner_state' },
  { re: /\.matcher_state\b/, label: '.matcher_state' },
  { re: /\.trip_context\b/, label: '.trip_context' },
  { re: /\bfinal_itinerary\s*[.?[]/, label: 'final_itinerary.<field>' },
  { re: /\bfinalItinerary\s*[.?[]/, label: 'finalItinerary.<field>' },
  { re: /\btrip_summary\b/, label: 'trip_summary' },
  { re: /\bboardData\s*[.?[]/, label: 'boardData.<field>' },
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

function scanForViolations(code, rel) {
  const bare = stripCommentsAndStrings(code);
  return FORBIDDEN.filter(({ re }) => re.test(bare)).map(({ label }) => `${rel} → ${label}`);
}

describe('trip_state read-model boundary (architectural fitness function)', () => {
  const appRoot = join(import.meta.dirname, '..', '..', '..');
  const files = SCAN_ROOTS.flatMap(root => walk(join(appRoot, root)));

  it('scans a non-trivial number of modules', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('no lib/ or components/ module reads raw trip_state branch paths', () => {
    const violations = files.flatMap(file => {
      const rel = relative(appRoot, file).replace(/\\/g, '/');
      if (ALLOW_LIST.has(rel)) return [];
      return scanForViolations(readFileSync(file, 'utf8'), rel);
    });
    expect(violations, `Raw trip_state access outside the composed read model:\n${violations.join('\n')}`).toEqual([]);
  });

  // Self-test: the rule must actually bite. If this stops failing, the
  // scanner has been weakened.
  it('flags each forbidden pattern in a deliberate-violation fixture', () => {
    const fixture = [
      'export const a = trip.trip_state.trip_context.origin;',
      'export const b = view.planner_state.awaiting;',
      'export const c = round.matcher_state.recommendations;',
      'export const d = doc.final_itinerary.days;',
      'export const e = doc.finalItinerary.trip_summary.title;',
      'export const f = board.boardData.items;',
      'export const g = result.unresolved;',
    ].join('\n');
    const hits = scanForViolations(fixture, 'fixture.js').map(v => v.split(' → ')[1]);
    expect(hits).toEqual(expect.arrayContaining([
      'trip_state', '.planner_state', '.matcher_state', '.trip_context',
      'final_itinerary.<field>', 'finalItinerary.<field>', 'trip_summary',
      'boardData.<field>', 'result.unresolved',
    ]));
  });
});
