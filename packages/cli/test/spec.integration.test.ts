import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/011-core-spec/tasks.html. CLI integration tests for the
 * `spectastic spec` subcommand. State-gate per P-6 / FR-003: re-entry path
 * (--reentry <spec-id>) hits the gate against the resolved spec.html.
 * Draft destination → sharpens in place; past-Draft → refuses with pointer
 * to /spectastic.propose; --force bypasses with warning. Argument shape
 * (description-string vs spec-id) is a prompt hint, not a destructive gate.
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
    const child = spawn('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, ...extraEnv },
    });
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

function setupReentryTarget(opts: { specStatus?: string }): {
  cwd: string;
  specId: string;
  specPath: string;
} {
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-spec-'));
  const specId = 'foo-bar';
  const specDir = join(cwd, 'specs', specId);
  mkdirSync(specDir, { recursive: true });
  const specPath = join(specDir, 'spec.html');
  if (opts.specStatus) {
    writeFileSync(
      specPath,
      `<!doctype html><html><body><main><spec-meta><b>Status</b><span><spec-status value="${opts.specStatus}">${opts.specStatus}</spec-status></span></spec-meta></main></body></html>`,
    );
  }
  return { cwd, specId, specPath };
}

describe('CLI integration: spec (T-112)', () => {
  it('--reentry against past-Draft spec.html refuses with exit 2 — silent-overwrite failure mode closed', async () => {
    const { cwd, specId, specPath } = setupReentryTarget({
      specStatus: 'accepted',
    });

    const r = await runCLI(['spec', 'sharpen me', '--reentry', specId], cwd);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain('past-Draft per P-6');
    expect(r.stderr).toContain('/spectastic.propose');
    // Existing content untouched.
    expect(readFileSync(specPath, 'utf8')).toContain('value="accepted"');
  });

  it('--reentry against Draft spec.html sharpens in place — gate passes', async () => {
    const { cwd, specId } = setupReentryTarget({ specStatus: 'draft' });

    const r = await runCLI(['spec', 'sharpen me', '--reentry', specId], cwd, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.stderr).toContain('Sharpening Draft');
    expect(r.stderr).toContain('per P-6');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--reentry --force on past-Draft bypasses with warning', async () => {
    const { cwd, specId } = setupReentryTarget({ specStatus: 'accepted' });

    const r = await runCLI(['spec', 'sharpen me', '--reentry', specId, '--force'], cwd, { ANTHROPIC_API_KEY: '' });
    expect(r.stderr).toContain('warn: bypassing change-management surface');
    expect(r.stderr).toContain('status was accepted');
    expect(r.code).not.toBe(0);
  });

  it('fresh-mode description proceeds past the re-entry gate', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-spec-fresh-'));

    const r = await runCLI(['spec', 'a new feature description'], cwd, {
      ANTHROPIC_API_KEY: '',
    });
    // No reentry path → no "Sharpening Draft" gate signal.
    expect(r.stderr).not.toContain('Sharpening Draft');
    // AI call attempted; fails on missing key.
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('happy path with SPECTASTIC_AI_STUB writes a complete spec.html (T-112)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-spec-stub-'));
    const scriptPath = resolve(here, 'fixtures', 'spec-script.json');

    const r = await runCLI(['spec', 'test feature'], cwd, {
      SPECTASTIC_AI_STUB: scriptPath,
      ANTHROPIC_API_KEY: '',
    });

    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('Wrote');
    expect(r.stdout).toContain('4 reqs');

    // The kernel derives a Spec ID from the description: `000-test-feature`.
    const generated = readFileSync(`${cwd}/specs/000-test-feature/spec.html`, 'utf8');
    expect(generated).toContain('FR-001');
    expect(generated).toContain('NFR-001');
    expect(generated).toContain('SC-001');
    expect(generated).toContain('US1');
    expect(generated).toContain('<spec-status value="draft">Draft</spec-status>');
  });
});
