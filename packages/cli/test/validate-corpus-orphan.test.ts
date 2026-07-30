import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 2026-07-26 061-corpus-ingester T-204 (US2, red-first): the registry scan
 * surfaced at the CLI boundary — an orphaned row warns (FR-007), a
 * hand-edited duplicate KB-NNNN errors (FR-003), mirroring
 * validate-corpus-gates.test.ts's spawn harness. Written before
 * scanCorpusRegistry is wired (T-214) — failing until then.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function project(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-corpus-registry-${tag}-`));
}

function writeRegistry(dir: string, rows: string): void {
  mkdirSync(join(dir, 'knowledge'), { recursive: true });
  writeFileSync(
    join(dir, 'knowledge', 'index.md'),
    [
      '| KB-NNNN | Marketplace | Plugin | Slug | Title | Edition | Path | Status |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      rows,
    ].join('\n'),
    'utf8',
  );
}

// The corpus registry scan needs a real knowledge/ pack to trigger at all
// (scanCorpusRegistry mirrors scanCorpusWellFormed's shape, a no-op with no
// knowledge/ directory) — the presence of the registry file's parent dir
// suffices since `loadCorpus`/the registry read only need `knowledge/` to
// exist, not a populated pack.
const MINIMAL_SPEC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture</title></head><body><main><p>x</p></main></body></html>
`;

describe('spectastic validate: the registry scan (061 T-204, FR-003/FR-007)', () => {
  it('warns on an orphaned registry row', async () => {
    const dir = project('orphan');
    writeRegistry(
      dir,
      '| KB-0001 | spectastic-examples | finance-settlement | 001-settlement-windows | Settlement windows | 2026-07-25 | knowledge/finance-settlement/references/001-settlement-windows.md | orphaned |',
    );
    writeFileSync(join(dir, 'plan.html'), MINIMAL_SPEC, 'utf8');

    const r = await runCLI(['validate', 'plan.html'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0); // warning-only, never blocks
    expect(r.stdout.toLowerCase()).toContain('orphan');
    expect(r.stdout).toContain('KB-0001');
  });

  it('errors on a hand-edited duplicate KB-NNNN', async () => {
    const dir = project('dup');
    writeRegistry(
      dir,
      [
        '| KB-0001 | spectastic-examples | finance-settlement | 001-settlement-windows | A | 2026-07-25 | knowledge/finance-settlement/references/001-settlement-windows.md |  |',
        '| KB-0001 | spectastic-examples | finance-settlement | 002-clearing-cutover | B | 2026-07-25 | knowledge/finance-settlement/references/002-clearing-cutover.md |  |',
      ].join('\n'),
    );
    writeFileSync(join(dir, 'plan.html'), MINIMAL_SPEC, 'utf8');

    const r = await runCLI(['validate', 'plan.html'], dir);
    expect(r.code, r.stdout + r.stderr).not.toBe(0);
    expect(r.stdout.toLowerCase()).toContain('duplicate');
  });

  it('is a no-op with no knowledge/ directory at all', async () => {
    const dir = project('no-knowledge-dir');
    writeFileSync(join(dir, 'plan.html'), MINIMAL_SPEC, 'utf8');

    const r = await runCLI(['validate', 'plan.html'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.toLowerCase()).not.toContain('orphan');
  });
});
