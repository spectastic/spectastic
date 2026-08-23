import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeFs } from '@spectastic/core/providers/node-fs';
import { playwrightRenderer } from '@spectastic/render';
import { describe, expect, it } from 'vitest';
import {
  importVisualExport,
  materialiseVisualDesign,
  renderVisualExport,
  runOneStepVisuals,
} from '../src/commands/visual.js';

/**
 * 110-visual-one-step CLI integration tests. US1 (T-101): the SC-001
 * byte-equality claim — the one real end-to-end test D-004 names, because
 * only a real comparison can prove two trees are byte-identical; a fake
 * renderer cannot. US2 (T-201): SC-002's refusal-cost claim.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const STUB_SCRIPT = resolve(here, 'fixtures', 'plan-script.json');
const FIXTURE_ARTBOARDS = resolve(here, '..', '..', 'render', 'test', 'fixtures', 'two-artboards.html');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd, env: { ...process.env, ...extraEnv } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function freshProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-visuals-e2e-'));
  mkdirSync(join(dir, 'specs', '001-x'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', '001-x', 'spec.html'),
    '<!doctype html><html><body><main><spec-meta></spec-meta></main></body></html>',
  );
  mkdirSync(join(dir, 'export'), { recursive: true });
  writeFileSync(join(dir, 'export', 'a.html'), readFileSync(FIXTURE_ARTBOARDS, 'utf8'));
  return dir;
}

/** T-900's own fixture: a design.html declaring a REAL visual surface,
 *  hand-authored rather than reached through `spectastic design`. Per the
 *  T-001 triage / the 2026-08-23 propose: designCommand's kernel never
 *  emits <spec-visual> regardless of stub or real AI, so the only way to
 *  exercise the delegated pipeline's own idempotence (FR-009) — as opposed
 *  to FR-008's no-op case, which is idempotent for the trivial reason that
 *  nothing is ever written — is to declare the surface directly. */
function freshSurfaceProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-visuals-idempotence-'));
  mkdirSync(join(dir, 'specs', '001-x'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', '001-x', 'design.html'),
    '<!doctype html><html><body><main><spec-visual shape="screens"></spec-visual></main></body></html>',
  );
  mkdirSync(join(dir, 'export'), { recursive: true });
  writeFileSync(join(dir, 'export', 'a.html'), readFileSync(FIXTURE_ARTBOARDS, 'utf8'));
  return dir;
}

/** Every file under `dir`, project-relative path -> raw bytes. Excludes
 *  nothing — a byte-equality claim that quietly skipped a file would not be
 *  one. */
function readTree(dir: string, base = dir): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      for (const [k, v] of readTree(full, base)) out.set(k, v);
    } else {
      out.set(relative(base, full), readFileSync(full));
    }
  }
  return out;
}

const STUB_ENV = { SPECTASTIC_AI_STUB: STUB_SCRIPT, ANTHROPIC_API_KEY: '' };

// The `--visuals`/`--from` value is `export`, the FOLDER — never
// `export/a.html`. visual:import's fetcher unconditionally requires a
// directory ("An export is a folder of files", local-source-fetcher.ts), and
// the one-step flow passes the same value to both import and render. Render
// navigating to a directory finds no [data-screen-label] elements — 0
// captured, which 110's own spec names a legitimate outcome, not a refusal —
// so this test proves byte-equality honestly rather than assert a capture
// the shared value cannot structurally produce.

describe('SC-001 — one command produces the same tree as running the three verbs by hand', () => {
  // T-1003 (the 2026-08-23 propose): rewritten against SC-001's revised
  // methodology. NOT reached through `spectastic design --visuals` any
  // more — a design generated that way never declares a surface (see the
  // grounding row in design.html), so a live two-tree comparison through
  // the flag trivially passes by writing nothing on either side. Tree A is
  // the orchestrator; Tree B is the SAME three CLI verb entry points it
  // delegates to, called by hand — genuinely two code paths, not a
  // comparison against the raw core kernels the orchestrator calls itself
  // (which would be tautological, per the adversarial pass on the
  // propose). Both trees start from an identical hand-authored,
  // surface-declaring design, never touching `spectastic design`'s
  // generation step at all.
  //
  // Also corrects a real error in the propose's own §6 task list: T-1003
  // named `packages/core/test/visual-one-step.test.ts` as this test's
  // path, but the CLI verb entry points it must compare against
  // (importVisualExport / renderVisualExport / materialiseVisualDesign)
  // live in `packages/cli`, which `packages/core` must never depend on —
  // so this test can only live here, where the old skipped version
  // already was. Caught while implementing, not silently followed.
  it('the flag and the hand-run sequence are byte-identical', async () => {
    const originalCwd = process.cwd();
    let treeA: Map<string, Buffer>;
    let treeB: Map<string, Buffer>;
    try {
      // Tree A: the orchestrator, one call.
      const flagCwd = freshSurfaceProject();
      process.chdir(flagCwd);
      await runOneStepVisuals({ specId: '001-x', from: 'export' }, { cwd: flagCwd, fs: nodeFs });
      treeA = readTree(join(flagCwd, 'specs', '001-x'));

      // Tree B: the same three CLI verb entry points, called by hand, in
      // order, over an identical starting tree.
      const handCwd = freshSurfaceProject();
      process.chdir(handCwd);
      const handCtx = { cwd: handCwd, fs: nodeFs };
      await importVisualExport({ from: 'export', into: 'specs/001-x/visual', identity: '001-x' }, handCtx);
      await renderVisualExport({ specId: '001-x', from: 'export' }, { ...handCtx, render: playwrightRenderer() });
      await materialiseVisualDesign({ specId: '001-x' }, handCtx);
      treeB = readTree(join(handCwd, 'specs', '001-x'));
    } finally {
      process.chdir(originalCwd);
    }

    expect([...treeA.keys()].sort()).toEqual([...treeB.keys()].sort());
    for (const [path, bytes] of treeA) {
      expect(bytes.equals(treeB.get(path) as Buffer), `${path} differs`).toBe(true);
    }
  }, 30_000);

  // Skipped, not fixed here or weakened — but the ORIGINAL citation on this
  // line was stale and has been corrected. The orphan-scan defect it named
  // (106's `renders/` nesting inside 105's own managed directory, reported
  // as "no longer in the export" on a redundant re-import) is FIXED —
  // RENDERS_SUBDIR is now excluded from 105's orphan-scan (location.ts,
  // T-900's own discovery via `runOneStepVisuals` called twice). Verified
  // empirically that this specific test does NOT exercise that path at all:
  // `flagCwd`'s design.html — generated via `spectastic design --visuals`,
  // same as SC-001's neighbour above — never declares a visual surface (the
  // same design-kernel gap T-001/the 2026-08-23 propose already diagnosed),
  // so `before` reflects FR-008's correct no-op and `after` reflects the
  // hand-run's unconditional material. The two trees diverge on KEY SET
  // (spec.html+design.html vs +3 more files), never reaching a byte
  // comparison at all — confirmed by temporarily un-skipping and reading the
  // actual assertion failure. Stays skipped for the SAME reason SC-001's
  // neighbour does, folded as T-1003.
  it.skip('running the three verbs by hand afterwards changes nothing (FR-002)', async () => {
    const flagCwd = freshProject();
    const flagResult = await runCLI(['design', '001-x', '--visuals', 'export'], flagCwd, STUB_ENV);
    expect(flagResult.code, flagResult.stderr).toBe(0);
    const before = readTree(join(flagCwd, 'specs', '001-x'));

    await runCLI(['visual:import', '--from', 'export', '--into', 'specs/001-x/visual', '--identity', '001-x'], flagCwd);
    await runCLI(['visual:render', '001-x', '--from', 'export'], flagCwd);
    await runCLI(['materialise', '001-x'], flagCwd);

    const after = readTree(join(flagCwd, 'specs', '001-x'));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [path, bytes] of after) {
      expect(bytes.equals(before.get(path) as Buffer), `${path} changed after a redundant hand re-run`).toBe(true);
    }
  }, 30_000);
});

// T-201 (US2, SC-002). No ANTHROPIC_API_KEY and no SPECTASTIC_AI_STUB — under
// this env, ANY attempt to construct/use an AI provider always
// surfaces the same "ANTHROPIC_API_KEY is not set" message (proven by
// design.integration.test.ts's own equivalent case). So that message's
// ABSENCE from stderr is direct, deterministic proof the AI path was never
// reached — no need to invent a call-counting stub for what a environment
// variable's own existing behaviour already demonstrates.
//
// This is expected to fail today: T-112's wiring calls designCommand (and so
// createAIProvider) before checking --visuals at all, so a bad export path
// currently costs a full design generation before the visuals step ever
// throws. T-210 reorders this.
const NO_AI_ENV = { ANTHROPIC_API_KEY: '' };

describe('SC-002 — a bad export path costs nothing (US2, T-201)', () => {
  it('refuses naming the bad path, makes 0 model calls, and writes 0 files', async () => {
    const cwd = freshProject();
    const before = readTree(join(cwd, 'specs', '001-x'));

    const r = await runCLI(['design', '001-x', '--visuals', 'does-not-exist'], cwd, NO_AI_ENV);

    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).not.toBe(0);
    expect(r.stderr).toContain('does-not-exist');
    // The AI-key message never appearing is the proof createAIProvider (and
    // so designCommand) was never reached.
    expect(r.stderr).not.toContain('ANTHROPIC_API_KEY');
    expect(existsSync(join(cwd, 'specs', '001-x', 'design.html'))).toBe(false);

    const after = readTree(join(cwd, 'specs', '001-x'));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [path, bytes] of after) {
      expect(bytes.equals(before.get(path) as Buffer), `${path} changed on a refused run`).toBe(true);
    }
  });
});

// T-302 (US3, SC-003). `--no-render` doesn't exist yet (T-310), so this is
// expected to fail — commander rejects the unrecognised option — until then.
//
// A real fixture limitation, discovered rather than assumed: designCommand's
// stub-driven kernel path never populates <spec-visual> — verified by
// re-entering a HAND-SEEDED declaration through `design` (it was wiped, 0
// occurrences after) and separately by adding a detected UI dependency to
// the fixture project (no declaration appeared regardless). The
// visual-surface interview is host-side (AskUserQuestion), not something
// this deterministic stub path drives at all. So a real spawn against this
// stub ALSO has no declared surface — meaning, once T-311 lands, render is
// not-attempted for BOTH reasons at once (--no-render AND no-surface), and
// this spawned test cannot isolate which one fired. What it CAN honestly
// prove: the flag parses, the run does not crash or fail, and render is
// reported not-attempted rather than silently skipped. The PRECISE claim
// SC-003 makes ("import ... still lands") is proven instead at the core
// level, with a fixture this test's own stub-generation path cannot produce
// (packages/core/test/visual-one-step.test.ts, T-300/T-301's neighbours).
describe('SC-003 — --no-render does not fail the run (US3, T-302)', () => {
  it('exits 0 and reports render as not attempted', async () => {
    const cwd = freshProject();
    const r = await runCLI(['design', '001-x', '--visuals', 'export', '--no-render'], cwd, STUB_ENV);

    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('render: not attempted');
  }, 30_000);
});

// T-900 (FR-009, SC-005's remaining leg). Not reached through
// `spectastic design --visuals` — a design generated that way never
// declares a surface (T-001 / the 2026-08-23 propose), so a run through the
// flag would trivially satisfy "changes no bytes" by writing nothing on
// EITHER invocation, proving nothing about the delegated pipeline's real
// idempotence. Calls `runOneStepVisuals` in-process instead — the same
// function `design.ts` calls, with the same real playwrightRenderer (not a
// fake; the task's own wording is "the captures", which only a real render
// pass can genuinely test for byte-stability) — twice over a
// surface-declaring, hand-authored design.
//
// A real, adjacent gap this test tripped over while being written, worth
// recording: `importDesignSource` uses `into` VERBATIM (no cwd-join — see
// T-100's own comment), and `nodeFs` passes every path straight to
// `node:fs/promises`, which resolves a relative path against the REAL
// `process.cwd()` — not `ctx.cwd`. A spawned CLI invocation never notices,
// because its child process's cwd genuinely IS the project directory; an
// in-process caller does notice, and the first version of this test
// silently wrote `specs/001-x/visual/**` into this actual repo rather than
// the temp fixture. `process.chdir` for the duration of the calls is the
// fix here, mirroring what a spawned subprocess provides for free — not a
// change to the implementation, which behaves correctly for every real
// caller (every one of them is the CLI itself).
describe('FR-009 — a second identical invocation is bounded, not silent (T-900)', () => {
  it('changes 0 bytes in the imported material and the captures, and at most 1 in design.html', async () => {
    const cwd = freshSurfaceProject();
    const ctx = { cwd, fs: nodeFs };
    const originalCwd = process.cwd();

    let afterFirst: Map<string, Buffer>;
    let afterSecond: Map<string, Buffer>;
    try {
      process.chdir(cwd);
      await runOneStepVisuals({ specId: '001-x', from: 'export' }, ctx);
      afterFirst = readTree(join(cwd, 'specs', '001-x'));

      await runOneStepVisuals({ specId: '001-x', from: 'export' }, ctx);
      afterSecond = readTree(join(cwd, 'specs', '001-x'));
    } finally {
      process.chdir(originalCwd);
    }

    expect([...afterSecond.keys()].sort()).toEqual([...afterFirst.keys()].sort());

    let designByteDelta = 0;
    for (const [path, bytesAfterSecond] of afterSecond) {
      const bytesAfterFirst = afterFirst.get(path) as Buffer;
      if (bytesAfterSecond.equals(bytesAfterFirst)) continue;
      // The one place a byte difference is permitted at all: design.html,
      // where the inherited materialise defect lives (design.html
      // Assumptions — 29,123 -> 29,122, stable after). Everything imported
      // or captured (visual/**) must be byte-identical between the two
      // runs; a diff there is a real regression, not the known one.
      expect(path, `unexpected byte diff outside design.html: ${path}`).toBe('design.html');
      designByteDelta = Math.abs(bytesAfterSecond.length - bytesAfterFirst.length);
    }
    expect(designByteDelta, 'design.html byte delta between run 1 and run 2').toBeLessThanOrEqual(1);
  }, 30_000);
});
