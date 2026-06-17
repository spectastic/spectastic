import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/012-core-plan/tasks.html. CLI integration tests for the
 * `spectastic plan` subcommand. State-gate per P-6 / FR-003: Draft
 * destination triggers auto-re-entry; past-Draft refuses with pointer to
 * /spectastic.propose; --force bypasses with warning.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

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
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function setupSpecDir(opts: { planStatus?: string }): {
  cwd: string;
  specId: string;
  planPath: string;
} {
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-plan-'));
  const specId = 'foo-bar';
  const specDir = join(cwd, 'specs', specId);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'spec.html'), '<!doctype html><html><body><main><spec-meta></spec-meta></main></body></html>');
  const planPath = join(specDir, 'plan.html');
  if (opts.planStatus) {
    writeFileSync(
      planPath,
      `<!doctype html><html><body><main><spec-meta><b>Status</b><span><spec-status value="${opts.planStatus}">${opts.planStatus}</spec-status></span></spec-meta></main></body></html>`,
    );
  }
  return { cwd, specId, planPath };
}

describe('CLI integration: plan (T-112)', () => {
  it('refuses past-Draft plan.html with exit 2 — silent-sharpen failure mode closed', async () => {
    const { cwd, specId, planPath } = setupSpecDir({ planStatus: 'accepted' });

    const r = await runCLI(['plan', specId], cwd);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain('past-Draft per P-6');
    expect(r.stderr).toContain('/spectastic.propose');
    expect(readFileSync(planPath, 'utf8')).toContain('value="accepted"');
  });

  it('auto-re-enters Draft plan.html — gate emits "Auto-re-entering Draft" then AI', async () => {
    const { cwd, specId } = setupSpecDir({ planStatus: 'draft' });

    const r = await runCLI(['plan', specId], cwd, { ANTHROPIC_API_KEY: '' });
    expect(r.stderr).toContain('Auto-re-entering Draft');
    expect(r.stderr).toContain('per P-6');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--force on past-Draft bypasses with warning', async () => {
    const { cwd, specId } = setupSpecDir({ planStatus: 'accepted' });

    const r = await runCLI(['plan', specId, '--force'], cwd, { ANTHROPIC_API_KEY: '' });
    expect(r.stderr).toContain('warn: bypassing change-management surface');
    expect(r.stderr).toContain('status was accepted');
    expect(r.code).not.toBe(0);
  });

  it('fresh path (no plan.html) proceeds past the gate', async () => {
    const { cwd, specId } = setupSpecDir({});

    const r = await runCLI(['plan', specId], cwd, { ANTHROPIC_API_KEY: '' });
    expect(r.stderr).not.toContain('Auto-re-entering Draft');
    expect(r.stderr).not.toContain('warn: bypassing');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('happy path with SPECTASTIC_AI_STUB writes a complete plan.html (T-112)', async () => {
    const { cwd, specId, planPath } = setupSpecDir({});
    const scriptPath = resolve(here, 'fixtures', 'plan-script.json');

    const r = await runCLI(
      ['plan', specId],
      cwd,
      { SPECTASTIC_AI_STUB: scriptPath, ANTHROPIC_API_KEY: '' },
    );

    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('Wrote');
    expect(r.stdout).toContain('1 ADRs');

    const generated = readFileSync(planPath, 'utf8');
    expect(generated).toContain('<spec-decision id="D-001">');
    expect(generated).toContain('Use the obvious approach');
    expect(generated).toContain('Approach B');
    expect(generated).toContain('data-winner');
  });
});
