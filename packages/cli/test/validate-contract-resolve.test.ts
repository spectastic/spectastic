import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * End-to-end test for the contract-resolve gate (spec 070-contract-sidecar-
 * convention, FR-004), through the real binary — the only place the check
 * actually fires (design D-002: it is a folded scan, not a schema rule, so it
 * does not run from a bare `validate(html)` library call).
 *
 * Runs with cwd set to the fixture project itself, so declared paths resolve
 * against packages/core/test/fixtures/contract-resolve/ as their project
 * root, not the spectastic monorepo root.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const FIXTURE_PROJECT = resolve(here, '..', '..', 'core', 'test', 'fixtures', 'contract-resolve');

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

describe('contract-resolve gate — end-to-end through the real binary', () => {
  it('exits non-zero and reports the six malformed declarations, with the present one silent', async () => {
    const result = await runCLI(['validate', 'specs/100-fixture-spec/design.html'], FIXTURE_PROJECT);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toMatch(/api\/openapi\.yaml/); // the present case — silent
    expect(result.stdout).toMatch(/does-not-exist\.yaml/);
    expect(result.stdout).toMatch(/a-directory/);
    expect(result.stdout).toMatch(/etc\/passwd/);
    expect(result.stdout).toMatch(/outside-the-project\.yaml/);
    expect(result.stdout).toMatch(/settlements\.yaml/);
    expect(result.stdout).toMatch(/myspecs\/api\.yaml/);
    expect(result.stdout).toMatch(/6 errors/);
  });
});
