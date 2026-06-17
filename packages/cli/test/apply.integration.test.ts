import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/010-core-apply/tasks.html. CLI integration tests for
 * `spectastic apply`. The verb is fully deterministic (no AI), but a
 * happy-path apply requires fully-wired fixtures (proposal + live spec +
 * matching delta targets). This pass covers the documented CLI surface:
 * --withdraw / --reason coupling, arg validation, error exit codes.
 * Full happy-path apply + withdraw is left to the kernel-level test.
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
    const child = spawn('node', [CLI, ...args], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

describe('CLI integration: apply (T-112)', () => {
  it('--withdraw without --reason exits 2 with informative message', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-apply-noreason-'));

    const r = await runCLI(['apply', '001-foo', '2026-06-17-bar', '--withdraw'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--withdraw requires --reason');
  });

  it('non-existent proposal fails (kernel-side error surfaces non-zero)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-apply-missing-'));

    const r = await runCLI(['apply', '001-foo', '2026-06-17-does-not-exist'], cwd);
    expect(r.code).not.toBe(0);
  });

  it('missing both required args fails (commander usage error)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-apply-noargs-'));

    const r = await runCLI(['apply'], cwd);
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('argument');
  });

  it('missing slug arg (one of two required) fails', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-apply-oneargs-'));

    const r = await runCLI(['apply', '001-foo'], cwd);
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('argument');
  });
});
