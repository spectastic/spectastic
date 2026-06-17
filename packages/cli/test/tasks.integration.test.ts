import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/009-core-tasks/tasks.html. CLI integration tests for the
 * `spectastic tasks` subcommand. Focuses on the state-gate per P-6 (FR-012
 * of 009 spec): refuse past-Draft, edit Draft in place, --force bypass,
 * fresh path proceeds. AI-driven generation deferred until stub-provider
 * injection lands.
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

/**
 * Sets up a temp project with specs/<id>/{spec.html,plan.html} + optional
 * tasks.html at the given state. Returns the tasks-spec ID + the spec
 * directory + the tasks.html path so the test can assert on them.
 */
function setupSpecDir(opts: { tasksStatus?: string }): {
  cwd: string;
  specId: string;
  tasksPath: string;
} {
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-tasks-'));
  const specId = 'foo-bar';
  const specDir = join(cwd, 'specs', specId);
  mkdirSync(specDir, { recursive: true });
  // Minimal but valid spec.html + plan.html sources.
  writeFileSync(join(specDir, 'spec.html'), '<!doctype html><html><body><main><spec-meta></spec-meta></main></body></html>');
  writeFileSync(join(specDir, 'plan.html'), '<!doctype html><html><body><main><spec-meta></spec-meta></main></body></html>');
  const tasksPath = join(specDir, 'tasks.html');
  if (opts.tasksStatus) {
    writeFileSync(
      tasksPath,
      `<!doctype html><html><body><main><spec-meta><b>Status</b><span><spec-status value="${opts.tasksStatus}">${opts.tasksStatus}</spec-status></span></spec-meta></main></body></html>`,
    );
  }
  return { cwd, specId, tasksPath };
}

describe('CLI integration: tasks (T-112)', () => {
  it('refuses past-Draft tasks.html with exit 2', async () => {
    const { cwd, specId, tasksPath } = setupSpecDir({ tasksStatus: 'accepted' });

    const r = await runCLI(['tasks', specId], cwd);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain('past-Draft per P-6');
    expect(r.stderr).toContain('/spectastic.propose');
    // File on disk unchanged.
    expect(readFileSync(tasksPath, 'utf8')).toContain('value="accepted"');
  });

  it('edits Draft tasks.html in place — gate passes, AI call follows', async () => {
    const { cwd, specId } = setupSpecDir({ tasksStatus: 'draft' });

    const r = await runCLI(['tasks', specId], cwd, { ANTHROPIC_API_KEY: '' });
    expect(r.stderr).toContain('Editing Draft');
    expect(r.stderr).toContain('per P-6');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--force on past-Draft bypasses with warning', async () => {
    const { cwd, specId } = setupSpecDir({ tasksStatus: 'accepted' });

    const r = await runCLI(['tasks', specId, '--force'], cwd, { ANTHROPIC_API_KEY: '' });
    expect(r.stderr).toContain('warn: bypassing change-management surface');
    expect(r.stderr).toContain('status was accepted');
    expect(r.code).not.toBe(0);
  });

  it('fresh path (no tasks.html) proceeds past the gate', async () => {
    const { cwd, specId } = setupSpecDir({});

    const r = await runCLI(['tasks', specId], cwd, { ANTHROPIC_API_KEY: '' });
    expect(r.stderr).not.toContain('Editing Draft');
    expect(r.stderr).not.toContain('warn: bypassing');
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });
});
