import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/013-core-propose/tasks.html. CLI integration tests for
 * `spectastic propose`. AI-heavy verb; tests cover the deterministic
 * surface (arg validation, --adversarial / --no-adversarial flag
 * parsing, key-missing path proving the wiring reaches AI).
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

describe('CLI integration: propose (T-112)', () => {
  it('reaches AI layer with both required args (proves CLI wiring)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-nokey-'));

    const r = await runCLI(
      ['propose', '001-foo', 'fake change description'],
      cwd,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--adversarial flag accepted by commander', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-adv-'));

    const r = await runCLI(
      ['propose', '001-foo', 'desc', '--adversarial'],
      cwd,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--no-adversarial flag accepted by commander', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-noadv-'));

    const r = await runCLI(
      ['propose', '001-foo', 'desc', '--no-adversarial'],
      cwd,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('missing required args fails (commander usage error)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-noargs-'));

    const r = await runCLI(['propose'], cwd);
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('argument');
  });
});
