import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectBoundaryMap } from '../src/units/adapters/boundary.js';
import { expandLayerOrder } from '../src/units/boundary.js';

/**
 * Boundary map detection (spec 081-boundary-map-detection).
 *
 * Fixtures are built from the shapes each tool documents, quoted in the design's
 * grounding table — neither format exists in a real project here, which the
 * design records rather than hides. This repository itself is the
 * unmapped-by-form fixture: it carries one dependency-cruiser rule and no
 * positive map, which is exactly the case FR-002 exists for.
 */

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-boundary-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

describe('US1 · the Nx ESLint form (081 T-100, FR-001)', () => {
  it('reads tags from project.json and constraints from an ESLint config', () => {
    const dir = fixture({
      'eslint.config.mjs': `export default [{
  rules: {
    '@nx/enforce-module-boundaries': ['error', {
      depConstraints: [
        { sourceTag: 'scope:client', onlyDependOnLibsWithTags: ['scope:shared'] },
        { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
      ],
    }],
  },
}];`,
      'apps/web/project.json': JSON.stringify({ tags: ['scope:client'] }),
      'libs/util/project.json': JSON.stringify({ tags: ['scope:shared'] }),
    });

    const result = detectBoundaryMap(dir);
    expect(result.kind).toBe('mapped');
    if (result.kind !== 'mapped') return;
    expect(result.map.source).toBe('nx');
    expect(result.map.units).toContain('scope:client');
    expect(result.map.units).toContain('scope:shared');
    expect(result.map.permitted).toContainEqual({ from: 'scope:client', to: 'scope:shared' });
    // The direction that is NOT permitted must be absent, not merely unlisted.
    expect(result.map.permitted).not.toContainEqual({ from: 'scope:shared', to: 'scope:client' });
  });
});

describe('US1 · the Nx conformance form (081 T-101, D-001)', () => {
  it('reads the other key name from nx.json, and tags from a package.json sub-key', () => {
    // The finding that reshaped the adapter: constraints live in two files under
    // two names. Reading only one would miss a project that plainly has a map.
    const dir = fixture({
      'nx.json': JSON.stringify({
        conformance: {
          rules: [
            {
              rule: '@nx/conformance/enforce-project-boundaries',
              options: {
                depConstraints: [{ sourceTag: 'type:app', onlyDependOnProjectsWithTags: ['type:lib'] }],
              },
            },
          ],
        },
      }),
      'packages/api/package.json': JSON.stringify({ name: 'api', nx: { tags: ['type:app'] } }),
    });

    const result = detectBoundaryMap(dir);
    expect(result.kind).toBe('mapped');
    if (result.kind !== 'mapped') return;
    expect(result.map.permitted).toContainEqual({ from: 'type:app', to: 'type:lib' });
    expect(result.map.units).toContain('type:app');
  });
});

describe('US1 · the import-linter form (081 T-102, D-002)', () => {
  it('expands an ordered layers contract into permitted pairs, losslessly', () => {
    const dir = fixture({
      '.importlinter': `[importlinter]
root_package = mypackage

[importlinter:contract:layers]
name = My layers contract
type = layers
layers = mypackage.high mypackage.medium mypackage.low
`,
    });

    const result = detectBoundaryMap(dir);
    expect(result.kind).toBe('mapped');
    if (result.kind !== 'mapped') return;
    expect(result.map.source).toBe('import-linter');
    expect(result.map.units).toEqual(['mypackage.high', 'mypackage.medium', 'mypackage.low']);
    // "lower layers are not allowed to depend on higher layers" — so high may
    // reach both below it, medium only low, and nothing points upward.
    expect(result.map.permitted).toEqual([
      { from: 'mypackage.high', to: 'mypackage.medium' },
      { from: 'mypackage.high', to: 'mypackage.low' },
      { from: 'mypackage.medium', to: 'mypackage.low' },
    ]);
  });

  it("reads setup.cfg too, and strips an optional layer's parentheses", () => {
    const dir = fixture({
      'setup.cfg': `[importlinter]
root_package = pkg

[importlinter:contract:c]
type = layers
layers = pkg.a (pkg.b) pkg.c
`,
    });
    const result = detectBoundaryMap(dir);
    expect(result.kind === 'mapped' && result.map.units).toEqual(['pkg.a', 'pkg.b', 'pkg.c']);
  });

  it('expands the ordering purely', () => {
    expect(expandLayerOrder(['a', 'b'])).toEqual([{ from: 'a', to: 'b' }]);
    expect(expandLayerOrder(['solo'])).toEqual([]);
    expect(expandLayerOrder([])).toEqual([]);
  });
});

describe('US1 · units without constraints is still a map (081 T-103)', () => {
  it('distinguishes a map with no permitted pairs from having no map', () => {
    const dir = fixture({
      'eslint.config.mjs':
        "export default [{ rules: { '@nx/enforce-module-boundaries': ['error', { depConstraints: [] }] } }];",
      'libs/a/project.json': JSON.stringify({ tags: ['scope:a'] }),
    });
    const result = detectBoundaryMap(dir);
    expect(result.kind).toBe('mapped');
    expect(result.kind === 'mapped' && result.map.permitted).toEqual([]);
    expect(result.kind === 'mapped' && result.map.units).toEqual(['scope:a']);
  });
});

describe('US2 · unmapped by form (081 T-200, FR-002/SC-002)', () => {
  it('reports this repository as unmapped, with the reason', () => {
    // The dogfood: one dependency-cruiser rule, no positive map anywhere.
    const result = detectBoundaryMap(REPO_ROOT);
    expect(result.kind).toBe('unmapped-by-form');
    if (result.kind !== 'unmapped-by-form') return;
    expect(result.detected).toBe('dependency-cruiser');
    expect(result.reason).toMatch(/forbidden/i);
    expect(result.reason).toMatch(/does not exist yet/i);
  });

  it('derives at most 0 directions from a forbidden-edge config', () => {
    const result = detectBoundaryMap(REPO_ROOT);
    expect('map' in result).toBe(false); // no partial map is ever produced
  });
});

describe('US2 · no config at all is a different answer (081 T-201/T-202)', () => {
  it('yields none, not unmapped-by-form', () => {
    const dir = fixture({ 'package.json': JSON.stringify({ name: 'solo' }) });
    expect(detectBoundaryMap(dir)).toEqual({ kind: 'none' });
  });

  it('a malformed config degrades to no map and does not throw (FR-006/SC-004)', () => {
    const dir = fixture({ '.importlinter': '[importlinter\nbroken = (' });
    expect(() => detectBoundaryMap(dir)).not.toThrow();
    expect(detectBoundaryMap(dir).kind).toBe('none');
  });

  it('an ESLint config whose constraints cannot be extracted yields no map, never a wrong one (D-004)', () => {
    const dir = fixture({
      'eslint.config.mjs': 'export default [{ rules: { "@nx/enforce-module-boundaries": buildConstraints() } }];',
    });
    expect(detectBoundaryMap(dir).kind).toBe('none');
  });
});

describe('US3 · detection stays out of the enforcement path (081 T-300, FR-003/SC-003)', () => {
  it('changes at most 0 enforcement verdicts', async () => {
    // FR-003's assertion, made concrete: the enforce verdict for a project is
    // identical whether or not it carries a boundary map.
    const { detectTooling } = await import('../src/enforce/detect.js');
    const withoutMap = fixture({ 'package.json': JSON.stringify({ name: 'p' }) });
    const withMap = fixture({
      'package.json': JSON.stringify({ name: 'p' }),
      '.importlinter':
        '[importlinter]\nroot_package = p\n\n[importlinter:contract:c]\ntype = layers\nlayers = p.a p.b\n',
    });
    expect(detectBoundaryMap(withMap).kind).toBe('mapped');
    expect([...detectTooling(withMap)].sort()).toEqual([...detectTooling(withoutMap)].sort());
  });
});

describe('polish · bounded and fast (081 T-900/T-901, NFR-001/NFR-002)', () => {
  it('detects on this repository well inside the budget', () => {
    const start = process.hrtime.bigint();
    detectBoundaryMap(REPO_ROOT);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(ms, `boundary detection took ${ms.toFixed(1)}ms`).toBeLessThan(250);
  });
});
