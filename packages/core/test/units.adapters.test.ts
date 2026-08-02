import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { enumerateJsUnits } from '../src/units/adapters/js.js';
import { nodeFsWorkspacePort } from '../src/units/adapters/node-fs.js';

/**
 * The adapters (spec 079-unit-dependency-edge, US3 / FR-006).
 *
 * Fixture projects for the npm shape, and this repository itself for the pnpm
 * shape — the case design D-003 took a YAML dependency for, because a JSON-only
 * reader finds zero units here and every claim about inference would then rest
 * on synthetic input alone.
 */

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-units-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

describe('US3 · npm-style workspaces (079 T-300, SC-002)', () => {
  it('enumerates members and the names they depend on, with nothing authored', () => {
    const dir = fixture({
      'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
      'packages/core/package.json': JSON.stringify({ name: '@acme/core' }),
      'packages/app/package.json': JSON.stringify({
        name: '@acme/app',
        dependencies: { '@acme/core': 'workspace:*', lodash: '^4' },
      }),
    });

    const units = enumerateJsUnits(dir);
    expect(units.map((u) => u.name)).toEqual(['@acme/app', '@acme/core']); // sorted
    expect(units.find((u) => u.name === '@acme/app')?.dependsOn).toContain('@acme/core');
  });

  it("accepts yarn's object form of the workspaces field", () => {
    const dir = fixture({
      'package.json': JSON.stringify({ name: 'root', workspaces: { packages: ['libs/*'] } }),
      'libs/one/package.json': JSON.stringify({ name: '@acme/one' }),
    });
    expect(enumerateJsUnits(dir).map((u) => u.name)).toEqual(['@acme/one']);
  });

  it('skips a directory that is not a package, rather than inventing a unit', () => {
    const dir = fixture({
      'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
      'packages/core/package.json': JSON.stringify({ name: '@acme/core' }),
      'packages/notes/README.md': '# not a package',
    });
    expect(enumerateJsUnits(dir).map((u) => u.name)).toEqual(['@acme/core']);
  });
});

describe('US3 · this repository, the pnpm case (079 T-301, D-003)', () => {
  it('finds its own workspace members from pnpm-workspace.yaml alone', () => {
    // The dogfooding assertion. The root package.json here has no `workspaces`
    // field, so this passing is exactly what a JSON-only reader could not do.
    const units = enumerateJsUnits(REPO_ROOT);
    const names = units.map((u) => u.name);
    expect(names).toContain('@spectastic/core');
    expect(names).toContain('@spectastic/schema');
    expect(units.length).toBeGreaterThan(2);
  });

  it('reads a real internal dependency between its own packages', () => {
    const units = enumerateJsUnits(REPO_ROOT);
    const core = units.find((u) => u.name === '@spectastic/core');
    expect(core?.dependsOn).toContain('@spectastic/schema');
  });

  it('is deterministic — repeated enumeration is identical (079 T-902)', () => {
    expect(enumerateJsUnits(REPO_ROOT)).toEqual(enumerateJsUnits(REPO_ROOT));
  });
});

describe('US3 · degradation (079 T-102, NFR-003)', () => {
  it('a project with no workspace declaration yields no units and does not throw', () => {
    const dir = fixture({ 'package.json': JSON.stringify({ name: 'solo' }) });
    expect(() => enumerateJsUnits(dir)).not.toThrow();
    expect(enumerateJsUnits(dir)).toEqual([]);
  });

  it('a malformed pnpm-workspace.yaml degrades to no units', () => {
    const dir = fixture({
      'package.json': JSON.stringify({ name: 'root' }),
      'pnpm-workspace.yaml': 'packages: [unclosed',
    });
    expect(() => enumerateJsUnits(dir)).not.toThrow();
    expect(enumerateJsUnits(dir)).toEqual([]);
  });
});

describe('the far-end lookup (079 T-210, FR-004/FR-005)', () => {
  it('reports an absent foreign checkout as unreadable, not as absence of a relation', () => {
    const dir = fixture({ 'spectastic.json': JSON.stringify({ project: 'me/mine' }) });
    const port = nodeFsWorkspacePort(dir);
    expect(port.farEnd('spectastic://acme/nowhere/unit/@acme/x', 'spectastic://me/mine/unit/mine')).toBe('unreadable');
  });

  it('a target inside this same project is readable but cannot self-agree', () => {
    const dir = fixture({ 'spectastic.json': JSON.stringify({ project: 'me/mine' }) });
    const port = nodeFsWorkspacePort(dir);
    expect(port.farEnd('spectastic://me/mine/unit/@me/other', 'spectastic://me/mine/unit/mine')).toBe('silent');
  });

  it('never throws on a malformed coordinate', () => {
    const port = nodeFsWorkspacePort(fixture({}));
    expect(() => port.farEnd('nonsense', 'also nonsense')).not.toThrow();
    expect(port.farEnd('nonsense', 'also nonsense')).toBe('unreadable');
  });
});

describe('polish · the read path stays within budget and writes nothing (079 T-900..T-902)', () => {
  it('resolves this repository well inside the 500 ms budget (NFR-001)', () => {
    // Measured rather than asserted loosely: the number goes in the run record.
    // The threshold carries headroom over the measurement so it cannot flake
    // under parallel load — it guards the order of magnitude, not the figure.
    const start = process.hrtime.bigint();
    const units = enumerateJsUnits(REPO_ROOT);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(units.length).toBeGreaterThan(0);
    expect(ms, `enumeration took ${ms.toFixed(1)}ms over ${units.length} units`).toBeLessThan(250);
  });

  it('writes at most 0 files during a full read (NFR-002)', () => {
    const dir = fixture({
      'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
      'packages/a/package.json': JSON.stringify({ name: '@x/a', dependencies: { '@x/b': '*' } }),
      'packages/b/package.json': JSON.stringify({ name: '@x/b' }),
      'spectastic.json': JSON.stringify({ project: 'x/x' }),
    });
    const before = snapshot(dir);
    const port = nodeFsWorkspacePort(dir);
    port.units();
    port.farEnd('spectastic://other/repo/unit/@o/z', 'spectastic://x/x/unit/root');
    expect(snapshot(dir)).toEqual(before);
  });
});

/** Every file under `dir` with its size — enough to catch a create or a rewrite. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.push(`${abs.slice(dir.length)}:${statSync(abs).size}`);
    }
  };
  walk(dir);
  return out.sort();
}
