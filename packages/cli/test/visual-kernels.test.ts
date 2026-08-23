import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-001 of specs/110-visual-one-step/tasks.html (Setup).
 *
 * Pins today's exact stdout and exit code for the three visual actions
 * 110-visual-one-step's Foundational phase is about to split into a kernel
 * plus a thin wrapper — before any extraction happens. Every assertion here
 * was captured by running the REAL built CLI against a real fixture and
 * reading its actual output, not written from the source or from memory: the
 * whole point is a regression net for a refactor that promises no behaviour
 * change, so an assumed contract would defeat the task.
 *
 * The render success case genuinely launches Chromium — the fixture is the
 * same `[data-screen-label]` two-artboard file 106's own tests use — because
 * the wrapper's stdout ("N written, M refused", the reconciliation lines) can
 * only be observed by actually capturing something.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const FIXTURE_ARTBOARDS = resolve(here, '..', '..', 'render', 'test', 'fixtures', 'two-artboards.html');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function freshProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-visual-kernels-'));
  mkdirSync(join(dir, 'specs', '001-x'), { recursive: true });
  mkdirSync(join(dir, 'export'), { recursive: true });
  writeFileSync(join(dir, 'export', 'a.html'), '<p>a</p>\n', 'utf8');
  return dir;
}

describe("materialise — today's exact contract", () => {
  it('exits 1 and names the missing design when none exists', async () => {
    const cwd = freshProject();
    const r = await runCLI(['materialise', '001-x'], cwd);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('No design at specs/001-x/design.html\n');
  });

  it('exits 0 and reports nothing written for a design with nothing to materialise', async () => {
    const cwd = freshProject();
    writeFileSync(
      join(cwd, 'specs', '001-x', 'design.html'),
      '<!doctype html><html><body><h1>x</h1></body></html>\n',
      'utf8',
    );
    const r = await runCLI(['materialise', '001-x'], cwd);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('view is current — nothing written\n');
  });
});

describe("visual:import — today's exact contract", () => {
  it('exits 1 and names the unreadable export when the path does not resolve', async () => {
    const cwd = freshProject();
    const r = await runCLI(
      ['visual:import', '--from', 'does-not-exist', '--into', 'landed', '--identity', 'test-id'],
      cwd,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('No export at "does-not-exist".\n');
  });

  it('exits 0 and reports the ledger tallies for a clean import', async () => {
    const cwd = freshProject();
    const r = await runCLI(['visual:import', '--from', 'export', '--into', 'landed', '--identity', 'test-id'], cwd);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('written 1 · skipped 0 · replaced 0 · orphaned 0');
    expect(r.stdout).toContain('Newly landed material is not yet reviewed — read it before relying on it.');
  });
});

describe("visual:render — today's exact contract", () => {
  it('exits 1 and surfaces the navigation error for an export that does not resolve', async () => {
    const cwd = freshProject();
    const r = await runCLI(['visual:render', '001-x', '--from', 'export/nope.html'], cwd);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('net::ERR_FILE_NOT_FOUND');
  });

  it('exits 0, captures both artboards and reconciles against the (empty) declared states', async () => {
    const cwd = freshProject();
    writeFileSync(
      join(cwd, 'specs', '001-x', 'design.html'),
      '<!doctype html><html><body><h1>x</h1></body></html>\n',
      'utf8',
    );
    const r = await runCLI(['visual:render', '001-x', '--from', FIXTURE_ARTBOARDS], cwd);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('captured first → specs/001-x/visual/renders/first.png');
    expect(r.stdout).toContain('captured second → specs/001-x/visual/renders/second.png');
    expect(r.stdout).toContain('2 written, 0 refused');
    expect(r.stdout).toContain(
      "undeclared: first — not in 001-x's declared states; attributed to the design, not adopted",
    );
    expect(r.stdout).toContain(
      "undeclared: second — not in 001-x's declared states; attributed to the design, not adopted",
    );
  }, 20_000);
});
