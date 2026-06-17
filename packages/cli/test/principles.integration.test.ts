import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/008-core-principles/tasks.html. CLI integration tests for
 * the `spectastic principles` subcommand. Focuses on the deterministic
 * surface: state-gate behaviour (P-6), refuse-with-exit-2, --force bypass
 * warning, fresh-path proceeds past the gate. Happy-path AI generation is
 * deferred until the CLI gains a stub-provider injection point — for now
 * we assert the gate's stderr signals + that the CLI reaches the AI layer
 * after the gate (manifesting as the ClaudeProvider's "ANTHROPIC_API_KEY
 * is not set" error when invoked without a real key).
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
 * Builds a minimal valid principles.html at the given path with the given
 * spec-status. Used to set up state-gate test cases.
 */
function writeFakeArtifact(path: string, statusValue: string): void {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Fake · Principles</title></head>
<body><main>
<header>
  <spec-meta>
    <b>Status</b><span><spec-status value="${statusValue}">${statusValue}</spec-status></span>
  </spec-meta>
</header>
</main></body></html>
`;
  writeFileSync(path, html);
}

describe('CLI integration: principles (T-112)', () => {
  it('refuses past-Draft destination with exit 2 + pointer to /spectastic.propose', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-principles-refuse-'));
    const out = join(tmpDir, 'principles.html');
    writeFakeArtifact(out, 'accepted');

    const r = await runCLI(['principles', '--output', out], tmpDir);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain('past-Draft per P-6');
    expect(r.stderr).toContain('/spectastic.propose');
    expect(r.stderr).toContain('--force');
    // File on disk must not have been overwritten.
    const after = readFileSync(out, 'utf8');
    expect(after).toContain('value="accepted"');
  });

  it('edits Draft destination in place — gate emits "Editing Draft" stderr then proceeds to AI', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-principles-draft-'));
    const out = join(tmpDir, 'principles.html');
    writeFakeArtifact(out, 'draft');

    // Without ANTHROPIC_API_KEY the AI call fails — that's exactly the signal we want:
    // "gate let us through, ClaudeProvider was constructed, then died on the missing key".
    const r = await runCLI(
      ['principles', '--output', out, '--name', 'test'],
      tmpDir,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.stderr).toContain('Editing Draft');
    expect(r.stderr).toContain('per P-6');
    // After the gate, the CLI constructed ClaudeProvider and tried to chat.
    // The exact failure mode is "ANTHROPIC_API_KEY is not set."
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--force on past-Draft bypasses with a warning', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-principles-force-'));
    const out = join(tmpDir, 'principles.html');
    writeFakeArtifact(out, 'accepted');

    const r = await runCLI(
      ['principles', '--output', out, '--force', '--name', 'test'],
      tmpDir,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.stderr).toContain('warn: bypassing change-management surface');
    expect(r.stderr).toContain('status was accepted');
    // The gate passed; the AI call then fails on missing key.
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('fresh path (no destination) proceeds past the gate', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-principles-fresh-'));
    const out = join(tmpDir, 'principles.html');
    expect(existsSync(out)).toBe(false);

    const r = await runCLI(
      ['principles', '--output', out, '--name', 'test'],
      tmpDir,
      { ANTHROPIC_API_KEY: '' },
    );
    // No "Editing Draft" message — the gate is in the write-fresh branch.
    expect(r.stderr).not.toContain('Editing Draft');
    expect(r.stderr).not.toContain('warn: bypassing');
    // AI call then fails on missing key — proves the gate let us through.
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });
});
