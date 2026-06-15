import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');
const CLI = resolve(here, '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[]): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd: REPO_ROOT });
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

describe('CLI integration', () => {
  it('binary exists (build must run first)', () => {
    expect(
      existsSync(resolve(here, '..', 'dist', 'index.js')),
      'expected dist/index.js to exist; run pnpm --filter @spectastic/cli build',
    ).toBe(true);
  });

  it('no args → usage + exit 2 (FR-001, FR-002)', async () => {
    const r = await runCLI([]);
    expect(r.code).toBe(2);
  });

  it('valid file → exit 0 (FR-002 happy path)', async () => {
    const r = await runCLI(['validate', 'principles.html']);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
  });

  it('broken fixture (missing defer-to) → exit 1 with no-missing-defer-to in output (FR-003, FR-006)', async () => {
    const fixture = 'packages/schema/fixtures/no-missing-defer-to/positive.html';
    const r = await runCLI(['validate', fixture]);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(1);
    expect(r.stdout + r.stderr).toContain('no-missing-defer-to');
  });

  it('glob matching nothing → exit 2 (edge case)', async () => {
    const r = await runCLI(['validate', 'no-such-pattern-*.html']);
    expect(r.code).toBe(2);
  });
});
