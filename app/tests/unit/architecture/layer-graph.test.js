import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// TWM-224 architectural fitness function — the layer graph. oxlint has no
// `eslint-plugin-boundaries`, so this enforces it. Top may import down,
// never up; leaves stay leaves. See "Architecture rules (enforced)" in
// TWM-UI/AGENTS.md.
//
//   pages      → hooks, components, context, lib, constants, data
//   hooks      → context, lib, constants
//   components → context, lib, constants        (no hooks, no pages)
//   context    → lib, constants
//   lib        → lib, constants                 (pure; api/booking do I/O)
//   constants  → (nothing internal)
//   data       → (nothing internal)
const LAYERS = ['pages', 'hooks', 'components', 'context', 'lib', 'constants', 'data'];
const ALLOWED = {
  pages: new Set(['pages', 'hooks', 'components', 'context', 'lib', 'constants', 'data']),
  hooks: new Set(['hooks', 'context', 'lib', 'constants', 'data']),
  components: new Set(['components', 'context', 'lib', 'constants', 'data']),
  context: new Set(['context', 'lib', 'constants', 'data']),
  lib: new Set(['lib', 'constants']),
  constants: new Set(['constants']),
  data: new Set(['constants']),
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(entry) && !/\.(test|spec)\./.test(entry)) out.push(full);
  }
  return out;
}

function layerOf(absPath, srcRoot) {
  const rel = relative(srcRoot, absPath).replace(/\\/g, '/');
  const top = rel.split('/')[0];
  return LAYERS.includes(top) ? top : null;
}

const IMPORT_RE = /(?:import|export)[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g;

describe('layer graph (architectural fitness function)', () => {
  const srcRoot = join(import.meta.dirname, '..', '..', '..', 'src');
  const files = walk(srcRoot);

  it('scans the whole src tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no module imports a layer it is not allowed to depend on', () => {
    const violations = [];
    for (const file of files) {
      const from = layerOf(file, srcRoot);
      if (!from) continue;
      const code = readFileSync(file, 'utf8');
      for (const [, spec] of code.matchAll(IMPORT_RE)) {
        if (!spec.startsWith('.')) continue; // external package
        const target = resolve(dirname(file), spec);
        const to = layerOf(target, srcRoot);
        if (!to || to === from) continue;
        if (!ALLOWED[from].has(to)) {
          violations.push(`${relative(srcRoot, file).replace(/\\/g, '/')}  (${from} → ${to})  '${spec}'`);
        }
      }
    }
    expect(violations, `Disallowed cross-layer imports:\n${violations.join('\n')}`).toEqual([]);
  });

  it('the allowed-dependency matrix stays acyclic top-to-bottom (self-test)', () => {
    // A quick guard that nobody widened a lower layer to import an upper one.
    expect(ALLOWED.lib.has('hooks')).toBe(false);
    expect(ALLOWED.lib.has('components')).toBe(false);
    expect(ALLOWED.components.has('hooks')).toBe(false);
    expect(ALLOWED.components.has('pages')).toBe(false);
    expect(ALLOWED.context.has('hooks')).toBe(false);
  });
});
