import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFs } from '../src/providers/node-fs.js';
import { visualCoverageFindings } from '../src/visual/coverage.js';

/**
 * `visualCoverageFindings` (093 FR-013, applied change
 * 2026-08-13-declare-the-variant-grid).
 *
 * The asymmetry under test: recording coverage is optional, recording it wrongly
 * is not — and a DECLINED context is a different kind of wrong from an unknown
 * one. Absence must never be a finding, or every design in the estate reports on
 * the day this lands.
 */

const FILE = 'specs/001-a/design.html';

const GRID = `<!doctype html><html><body><main>
<spec-variant-grid>
  <spec-axis name="mode" default="light" selects="values">
    <spec-context name="light"></spec-context>
    <spec-context name="dark"></spec-context>
  </spec-axis>
  <spec-axis name="platform" default="ios" selects="interaction">
    <spec-context name="ios"></spec-context>
    <spec-context name="macos"></spec-context>
    <spec-context name="tvos" declined><p>A converter on a focus remote is worse than not existing.</p></spec-context>
  </spec-axis>
</spec-variant-grid>
</main></body></html>`;

function project(gridBody = GRID): string {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-visual-coverage-'));
  const abs = join(root, 'visual/variants.html');
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, gridBody, 'utf8');
  return root;
}

const claim = (contexts: string) => [{ contexts, variants: 'visual/variants.html', line: 3, column: 1 }];

const run = (root: string, contexts: string) => visualCoverageFindings(claim(contexts), FILE, nodeFs, root);

describe('a claim that resolves', () => {
  it('is silent for contexts the grid declares', async () => {
    expect(await run(project(), 'platform=ios mode=dark')).toEqual([]);
  });

  it('is silent for an explicit whole-grid claim, without reading the grid at all', async () => {
    expect(await run(project(), 'all')).toEqual([]);
  });
});

describe('absence', () => {
  it('is never a finding — no claims means no work and no output', async () => {
    expect(await visualCoverageFindings([], FILE, nodeFs, project())).toEqual([]);
  });
});

describe('a claim that does not resolve', () => {
  it('reports an axis the grid does not declare', async () => {
    const f = await run(project(), 'density=compact');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('names axis "density"');
  });

  it('reports a context the axis does not declare', async () => {
    const f = await run(project(), 'platform=android');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('"android"');
  });

  it('reports an empty claim, which records having addressed nothing', async () => {
    const f = await run(project(), '   ');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('records having addressed nothing');
  });
});

describe('a declined context', () => {
  it('is reported as a contradiction, not as a typo', async () => {
    const f = await run(project(), 'platform=tvos');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('declines');
    // The wording has to distinguish the two cases, because the reader's next
    // action differs: fix a spelling, versus reopen a recorded decision.
    expect(f[0]?.fixHint).toMatch(/contradicts a recorded decision/);
  });

  it('is reported alongside, not instead of, other problems in the same claim', async () => {
    const f = await run(project(), 'platform=tvos mode=sepia');
    expect(f).toHaveLength(2);
  });
});

describe('a repeated axis (093/T-003)', () => {
  // The defect: `parseAxisContextPairs` returns Record<axis, context> — one
  // slot per axis name — so a claim addressing the same axis at more than one
  // context kept only the LAST. Every earlier value went unchecked: not
  // resolved, and not reported when wrong. Real exposure: the
  // currency-converter exemplar's own declaration repeats both `mode` and
  // `platform`, so it was being validated against a fraction of what it
  // claimed, invisibly, only because each surviving value happened to be real.
  it('checks every context on a repeated axis, not only the last', async () => {
    // `ligt` is a typo in the FIRST of two `mode=` pairs. Before the fix the
    // trailing `mode=dark` overwrote it and this reported nothing at all.
    const f = await run(project(), 'mode=ligt mode=dark');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('"ligt"');
  });

  it('stays silent when every context on a repeated axis is real', async () => {
    expect(await run(project(), 'mode=light mode=dark platform=ios platform=macos')).toEqual([]);
  });

  it('reports a declined context even when it is not the last value for its axis', async () => {
    const f = await run(project(), 'platform=tvos platform=ios');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('declines');
  });
});

describe('an unreadable grid', () => {
  it('stays silent here, because the resolve scan already reports it', async () => {
    const root = project();
    const f = await visualCoverageFindings(
      [{ contexts: 'platform=ios', variants: 'visual/gone.html', line: 3, column: 1 }],
      FILE,
      nodeFs,
      root,
    );
    expect(f).toEqual([]);
  });
});
