import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 110-visual-one-step, US1 (T-101). The SC-001 byte-equality claim — the one
 * real end-to-end test D-004 names, because only a real comparison can prove
 * two trees are byte-identical; a fake renderer cannot.
 *
 * `--visuals` doesn't exist yet on the design command (T-112 builds it), so
 * this file is expected to fail — commander rejects the unrecognised
 * option — until then. That is the correct red state.
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

describe('SC-001 — one command produces the same tree as running the three verbs by hand', () => {
  it('the flag and the hand-run sequence are byte-identical', async () => {
    // Tree A: one command.
    const flagCwd = freshProject();
    const flagResult = await runCLI(['design', '001-x', '--visuals', 'export/a.html'], flagCwd, STUB_ENV);
    expect(flagResult.code, `stdout: ${flagResult.stdout}\nstderr: ${flagResult.stderr}`).toBe(0);

    // Tree B: the design generation, then the three verbs by hand, in order.
    const handCwd = freshProject();
    const designResult = await runCLI(['design', '001-x'], handCwd, STUB_ENV);
    expect(designResult.code, `stdout: ${designResult.stdout}\nstderr: ${designResult.stderr}`).toBe(0);
    const importResult = await runCLI(
      ['visual:import', '--from', 'export/a.html', '--into', 'specs/001-x/visual', '--identity', '001-x'],
      handCwd,
    );
    expect(importResult.code, importResult.stderr).toBe(0);
    const renderResult = await runCLI(['visual:render', '001-x', '--from', 'export/a.html'], handCwd);
    expect(renderResult.code, renderResult.stderr).toBe(0);
    const materialiseResult = await runCLI(['materialise', '001-x'], handCwd);
    expect(materialiseResult.code, materialiseResult.stderr).toBe(0);

    const treeA = readTree(join(flagCwd, 'specs', '001-x'));
    const treeB = readTree(join(handCwd, 'specs', '001-x'));

    expect([...treeA.keys()].sort()).toEqual([...treeB.keys()].sort());
    for (const [path, bytes] of treeA) {
      expect(bytes.equals(treeB.get(path) as Buffer), `${path} differs`).toBe(true);
    }
  }, 30_000);

  it('running the three verbs by hand afterwards changes nothing (FR-002)', async () => {
    const flagCwd = freshProject();
    const flagResult = await runCLI(['design', '001-x', '--visuals', 'export/a.html'], flagCwd, STUB_ENV);
    expect(flagResult.code, flagResult.stderr).toBe(0);
    const before = readTree(join(flagCwd, 'specs', '001-x'));

    await runCLI(
      ['visual:import', '--from', 'export/a.html', '--into', 'specs/001-x/visual', '--identity', '001-x'],
      flagCwd,
    );
    await runCLI(['visual:render', '001-x', '--from', 'export/a.html'], flagCwd);
    await runCLI(['materialise', '001-x'], flagCwd);

    const after = readTree(join(flagCwd, 'specs', '001-x'));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [path, bytes] of after) {
      expect(bytes.equals(before.get(path) as Buffer), `${path} changed after a redundant hand re-run`).toBe(true);
    }
  }, 30_000);
});
