import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/007-core-triage/tasks.html. CLI integration tests for
 * `spectastic triage`. The verb uses AI to draft cards; without a stub
 * provider injection point we cover the deterministic CLI surface
 * (arg parsing, key-missing path) and assert that the AI layer is
 * reached after arg validation.
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

describe('CLI integration: triage (T-112)', () => {
  it('description arg + missing API key reaches AI layer (proves CLI wiring)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-triage-nokey-'));

    const r = await runCLI(['triage', 'fake failure description'], cwd, {
      ANTHROPIC_API_KEY: '',
    });
    // CLI wiring constructs ClaudeProvider which throws on missing key.
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--mode list arg + missing API key reaches AI layer (proves list-intake wiring)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-triage-list-'));

    const r = await runCLI(['triage', 'item one, item two, item three', '--mode', 'list'], cwd, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--format json arg parses (commander does not reject before action)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-triage-json-'));

    const r = await runCLI(['triage', 'fake desc', '--format', 'json'], cwd, {
      ANTHROPIC_API_KEY: '',
    });
    // Reaches the action handler → AI key error (not commander's argument error).
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('happy path with SPECTASTIC_AI_STUB produces a triage card (T-112)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-triage-stub-'));
    const scriptPath = resolve(here, 'fixtures', 'triage-script.json');

    const r = await runCLI(['triage', 'Login button does nothing when clicked', '--format', 'json'], cwd, {
      SPECTASTIC_AI_STUB: scriptPath,
      ANTHROPIC_API_KEY: '',
    });

    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    // --format json emits the card data as JSON; assert on the parsed shape.
    const parsed = JSON.parse(r.stdout) as {
      cards: Array<{ layer: string; headline: string }>;
    };
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]?.layer).toBe('implementation');
    expect(parsed.cards[0]?.headline).toContain('Login button');
  });
});
