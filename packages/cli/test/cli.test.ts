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

  it('--format json → emits JSON array (T-200, FR-004)', async () => {
    const fixture = 'packages/schema/fixtures/no-missing-defer-to/positive.html';
    const r = await runCLI(['validate', '--format', 'json', fixture]);
    expect(r.code).toBe(1);
    const parsed: unknown = JSON.parse(r.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    const arr = parsed as Array<{
      rule: string;
      severity: string;
      file: string;
    }>;
    expect(arr.length).toBeGreaterThan(0);
    expect(arr.some((f) => f.rule === 'no-missing-defer-to')).toBe(true);
    expect(arr.every((f) => typeof f.severity === 'string')).toBe(true);
  });

  it('--format sarif → emits SARIF 2.1.0 (T-201, FR-005)', async () => {
    const fixture = 'packages/schema/fixtures/no-missing-defer-to/positive.html';
    const r = await runCLI(['validate', '--format', 'sarif', fixture]);
    expect(r.code).toBe(1);
    const sarif = JSON.parse(r.stdout) as {
      version: string;
      runs: Array<{
        tool: { driver: { name: string } };
        results: Array<{ ruleId: string }>;
      }>;
    };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0]?.tool.driver.name).toBe('spectastic');
    expect(sarif.runs[0]?.results.length).toBeGreaterThan(0);
    expect(sarif.runs[0]?.results.some((r2) => r2.ruleId === 'no-missing-defer-to')).toBe(true);
  });
});
