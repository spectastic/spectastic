import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * End-to-end test for the contract-view-drift gate (spec 072-contract-
 * embedded-view, FR-004), through the real binary — the only place the
 * check actually fires (mirrors 070's validate-contract-resolve.test.ts;
 * design: a folded scan, not a schema rule).
 *
 * Runs with cwd set to the fixture project itself, so declared paths
 * resolve against packages/core/test/fixtures/contract-view-drift/.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const FIXTURE_PROJECT = resolve(here, '..', '..', 'core', 'test', 'fixtures', 'contract-view-drift');

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

describe('contract-view-drift gate — end-to-end through the real binary', () => {
  it('exits non-zero and reports exactly the stale view, with the clean one silent', async () => {
    const result = await runCLI(['validate', 'specs/300-drift-fixture/design.html'], FIXTURE_PROJECT);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toMatch(/clean\.yaml/);
    expect(result.stdout).toMatch(/stale\.yaml/);
    expect(result.stdout).toMatch(/contract-view-stale/);
    expect(result.stdout).toMatch(/1 error/);
  });
});
