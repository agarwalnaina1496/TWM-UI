// TWM-225: the quarterly drift audit for TWM-UI. The per-PR CI (`npm run
// lint` + the `tests/unit/architecture/` fitness functions) *enforces* the
// rules; this catches the tree creeping toward a break — a file nearing the
// size cap, an exempt list quietly growing, a `lib/` allow-list drifting.
// It never fails the build; it prints a findings report a human triages
// (see AGENTS.md -> "Architecture audit (quarterly)").

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP_ROOT = join(import.meta.dirname, '..');
const SRC = join(APP_ROOT, 'src');

const SIZE_CAP = 600;
const NEAR_CAP = 480; // within 120 lines of the hard cap

const EXPECTED_COMPLEXITY_EXEMPT = 3; // Destinations, ScoutChat, TripPreview
const EXPECTED_LIB_IO_ALLOW = ['tripApi.js', 'authApi.js', 'analytics.js', 'queryClient.js', 'booking/**'];

const findings = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(entry) && !/\.(test|spec)\.jsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// --- 1. source files approaching the size cap ---
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (lines >= NEAR_CAP) {
    const rel = relative(APP_ROOT, file);
    findings.push(
      lines > SIZE_CAP
        ? `SIZE  ${rel} is ${lines} lines — OVER the ${SIZE_CAP} cap (oxlint should already fail; investigate).`
        : `SIZE  ${rel} is ${lines} lines — within ${SIZE_CAP - lines} of the ${SIZE_CAP} cap. Split before it forces an exemption.`,
    );
  }
}

// --- 2. config exempt-list drift ---
const config = JSON.parse(readFileSync(join(APP_ROOT, '.oxlintrc.json'), 'utf8'));
const overrides = config.overrides ?? [];

const complexityExempt = overrides
  .filter(o => o.rules?.['eslint/complexity'] === 'off')
  .flatMap(o => o.files ?? [])
  .filter(f => /^src\/[^*]+\.jsx?$/.test(f));
if (complexityExempt.length > EXPECTED_COMPLEXITY_EXEMPT) {
  findings.push(
    `EXEMPT  complexity:off list has grown to ${complexityExempt.length} (expected ${EXPECTED_COMPLEXITY_EXEMPT}): ${complexityExempt.join(', ')}. ` +
      `Each entry is a rule bent — ratchet under the cap, don't add.`,
  );
}

const libIoAllow = (overrides.find(o => (o.files ?? []).some(f => f.startsWith('src/lib/') && f !== 'src/lib/**'))?.files ?? [])
  .map(f => f.replace('src/lib/', ''));
const unexpected = libIoAllow.filter(f => !EXPECTED_LIB_IO_ALLOW.includes(f));
if (unexpected.length) {
  findings.push(
    `EXEMPT  lib/ purity allow-list gained ${unexpected.join(', ')} — a new lib/ module doing I/O. ` +
      `Confirm it belongs in lib/ and not a hook.`,
  );
}

// --- 3. max-lines-per-function ratchet list (from oxlint, best-effort) ---
findings.push(
  `RATCHET  the AGENTS.md "over-cap render functions" list is the max-lines-per-function ` +
    `debt (advisory). Run \`npm run lint\` for the live list and confirm it only shrank.`,
);

// --- report ---
const stamp = new Date().toISOString().slice(0, 10);
console.log(`# TWM-UI architecture audit — ${stamp}\n`);
if (findings.length === 1) {
  console.log('No structural drift found (size caps, exempt lists all within expectation).\n');
}
for (const f of findings) console.log(`- ${f}`);
console.log('\n_Triage: fix small items now; open a cleanup story for larger ones. Update AGENTS.md when a budget or exemption changes._');
