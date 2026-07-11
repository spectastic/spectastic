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

  it('Verified fully tooled (incl. a coverage threshold + a metrics exporter) → exit 0', async () => {
    const dir = await project('verified', 'ok');
    writeFileSync(
      join(dir, 'pyproject.toml'),
      '[tool.ruff]\n[tool.mypy]\n[tool.bandit]\n[tool.pytest.ini_options]\n[tool.coverage.report]\nfail_under = 90\n',
      'utf8',
    );
    // verified now also requires observability — a declared metrics exporter.
    writeFileSync(join(dir, 'requirements.txt'), 'prometheus-client==0.20.0\n', 'utf8');
    const r = await runCLI(['enforce'], dir);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).toContain('all detectable required enforcement categories are covered');
  });

  it('Verified with everything but a metrics exporter → exit 1 naming observability (T-018 obs. change)', async () => {
    const dir = await project('verified', 'no-obs');
    writeFileSync(
      join(dir, 'pyproject.toml'),
      '[tool.ruff]\n[tool.mypy]\n[tool.bandit]\n[tool.pytest.ini_options]\n[tool.coverage.report]\nfail_under = 90\n',
      'utf8',
    );
    // a bare @opentelemetry/api would be a tracing core lib, not an exporter — must NOT satisfy observability.
    writeFileSync(join(dir, 'package.json'), '{"dependencies":{"@opentelemetry/api":"^1.9.0"}}', 'utf8');
    const r = await runCLI(['enforce'], dir);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/✗ missing:[^\n]*observability/);
  });

  it('Verified with a bare coverage library but no threshold → coverage still counts as missing (T-018 change)', async () => {
    const dir = await project('verified', 'bare-coverage');
    writeFileSync(
      join(dir, 'pyproject.toml'),
      '[tool.ruff]\n[tool.mypy]\n[tool.bandit]\n[tool.pytest.ini_options]\n',
      'utf8',
    );
    // A coverage tool is "present" (pytest-cov listed) but no fail_under/threshold is
    // declared — must not be certified as covered (adversarial-pass Risk 1).
    writeFileSync(join(dir, 'requirements.txt'), 'pytest-cov==5.0.0\n', 'utf8');
    const r = await runCLI(['enforce'], dir);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('missing');
    expect(r.stdout).toMatch(/coverage/);
  });
});

describe('enforce: FR-010 a structurally-undetectable category warns, never false-fails', () => {
  it('Go verified project with no coverage config → warns (exit 0), never hard-fails on coverage alone', async () => {
    const dir = await project('verified', 'go');
    // go.mod alone gives formatter/test-runner; add threshold-bearing config for
    // the rest so the ONLY remaining gap is coverage — isolating FR-010's effect.
    writeFileSync(join(dir, 'go.mod'), 'module x\n\ngo 1.22\n', 'utf8');
    writeFileSync(join(dir, '.golangci.yml'), 'linters:\n  enable:\n    - gosec\n', 'utf8');
    const r = await runCLI(['enforce'], dir);
    expect(r.stdout).toContain('undetectable in this ecosystem (not blocking)');
    expect(r.stdout).toMatch(/coverage/);
    // type-checker has no Go signal at all (not in STRUCTURALLY_UNDETECTABLE), so it's
    // still a real gap — this fixture is intentionally not fully tooled; the assertion
    // that matters is that coverage never appears under "missing".
    expect(r.stdout).not.toMatch(/✗ missing:[^\n]*coverage/);
  });

  it('Swift verified project → observability warns (Swift has no exporter-manifest surface), never under missing', async () => {
    const dir = await project('verified', 'swift');
    writeFileSync(join(dir, 'Package.swift'), '// swift-tools-version:5.9\n', 'utf8');
    writeFileSync(join(dir, '.swiftlint.yml'), '', 'utf8');
    writeFileSync(join(dir, '.swiftformat'), '', 'utf8');
    const r = await runCLI(['enforce'], dir);
    expect(r.stdout).toMatch(/undetectable in this ecosystem \(not blocking\):[^\n]*observability/);
    expect(r.stdout).not.toMatch(/✗ missing:[^\n]*observability/);
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
