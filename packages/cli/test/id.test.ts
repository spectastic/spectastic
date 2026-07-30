import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

/**
 * 067-spec-project-identity T-203: `spectastic id` is deterministic (FR-005,
 * NFR-001, SC-002) — repeated invocations against a fixed config yield
 * byte-identical output, and resolving never spawns a git process (the
 * derivation is confined to `init`'s write path, plan D-002).
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

function project(config: Record<string, unknown>, specIds: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-cli-id-'));
  writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(config));
  for (const id of specIds) mkdirSync(join(dir, 'specs', id), { recursive: true });
  return dir;
}

describe('spectastic id (067 T-203, FR-005, NFR-001, SC-002)', () => {
  it('prints the canonical resource URI and exits 0', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const r = await runCLI(['id', '042-example'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('spectastic://acme/widget/spec/042-example');
  });

  it('appends --anchor as a URI fragment', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const r = await runCLI(['id', '042-example', '--anchor', 'FR-001'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('spectastic://acme/widget/spec/042-example#FR-001');
  });

  it('is byte-identical across repeated invocations', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const first = await runCLI(['id', '042-example'], dir);
    const second = await runCLI(['id', '042-example'], dir);
    expect(first.stdout).toBe(second.stdout);
  });

  it('errors cleanly on an unknown spec', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const r = await runCLI(['id', '999-nope'], dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('999-nope');
  });
});
