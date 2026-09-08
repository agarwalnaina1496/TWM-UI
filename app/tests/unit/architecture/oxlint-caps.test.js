import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// TWM-224 — the size / arity / complexity / purity caps live in
// .oxlintrc.json (oxlint, run by `npm run lint` in CI). This guards the
// config so a rule cannot be quietly downgraded or deleted: the check for
// the check.
describe('oxlint architecture caps stay configured', () => {
  const config = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', '..', '.oxlintrc.json'), 'utf8'),
  );
  const rules = config.rules ?? {};

  it('max-lines is an error at <= 600', () => {
    const r = rules['eslint/max-lines'];
    expect(r?.[0]).toBe('error');
    expect(r?.[1]?.max).toBeLessThanOrEqual(600);
  });

  it('max-params is an error at <= 6', () => {
    const r = rules['eslint/max-params'];
    expect(r?.[0]).toBe('error');
    expect(r?.[1]?.max).toBeLessThanOrEqual(6);
  });

  it('complexity is an error at <= 25', () => {
    const r = rules['eslint/complexity'];
    expect(r?.[0]).toBe('error');
    expect(r?.[1]).toBeLessThanOrEqual(25);
  });

  it('max-lines-per-function is at least a warning', () => {
    const r = rules['eslint/max-lines-per-function'];
    expect(['warn', 'error']).toContain(r?.[0]);
  });

  it('lib/ purity forbids react and react-router-dom imports', () => {
    const libOverride = (config.overrides ?? []).find(o => o.files?.includes('src/lib/**'));
    const paths = libOverride?.rules?.['eslint/no-restricted-imports']?.[1]?.paths ?? [];
    const names = paths.map(p => p.name);
    expect(names).toEqual(expect.arrayContaining(['react', 'react-router-dom']));
  });

  it('the complexity-exempt list only holds the three known legacy pages', () => {
    const exempt = (config.overrides ?? [])
      .filter(o => o.rules?.['eslint/complexity'] === 'off')
      .flatMap(o => o.files ?? [])
      .filter(f => /^src\/[^*]+\.jsx?$/.test(f));
    expect(exempt.sort()).toEqual([
      'src/pages/Destinations.jsx',
      'src/pages/ScoutChat.jsx',
      'src/pages/TripPreview.jsx',
    ]);
  });
});
