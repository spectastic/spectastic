import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Integration tests for `spectastic enforce` (spec 042, T-100, SC-001/SC-003).
 * Spawns the real binary; needs a fresh build (profiles.json enforce field
 * bundled). Run `pnpm --filter @spectastic/cli build` first.
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
    const child = spawn('node', [CLI, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

async function project(profile: string, tag: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), `spectastic-enforce-${tag}-`));
  await runCLI(['init', '--profile', profile], dir);
  return dir;
}

describe('enforce: US1 the floor is a gate (SC-001)', () => {
  it('Verified with no tooling → exit 1 naming missing categories', async () => {
    const dir = await project('verified', 'gap');
    const r = await runCLI(['enforce'], dir);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('missing');
    expect(r.stdout).toMatch(/type-checker|linter/);
  });

  it('Verified fully tooled → exit 0', async () => {
    const dir = await project('verified', 'ok');
    writeFileSync(
      join(dir, 'pyproject.toml'),
      '[tool.ruff]\n[tool.mypy]\n[tool.bandit]\n[tool.pytest.ini_options]\n',
      'utf8',
    );
    const r = await runCLI(['enforce'], dir);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).toContain('all required enforcement categories are covered');
  });
});

describe('enforce: US1 severity scaling (SC-003)', () => {
  it('Lean → no-op exit 0', async () => {
    const dir = await project('lean', 'lean');
    expect((await runCLI(['enforce'], dir)).code).toBe(0);
  });

  it('Standard with a gap → warns, exit 0', async () => {
    const dir = await project('standard', 'std');
    const r = await runCLI(['enforce'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/missing|soft gate/);
  });

  it('no marker → no-op exit 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-enforce-none-'));
    const r = await runCLI(['enforce'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('no profile marker');
  });
});
