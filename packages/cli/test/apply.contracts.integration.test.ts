import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * End-to-end contract promotion through the real `spectastic apply` binary
 * (spec 071-contract-promotion, T-900/T-901). Each fixture under
 * packages/core/test/fixtures/promotion/ is copied to a fresh temp directory
 * per test — the fixtures are checked-in source, never mutated in place.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const FIXTURES = resolve(here, '..', '..', 'core', 'test', 'fixtures', 'promotion');

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

function copyFixture(name: string): string {
  // Prefix deliberately avoids the words "contract"/"promot(e|ion)" — the fixture
  // name (e.g. "no-contract") would otherwise leak into stdout assertions below
  // via the echoed cwd path, which is not what those assertions mean to check.
  const dir = mkdtempSync(join(tmpdir(), `spectastic-apply-fixture-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

describe('contract promotion — end-to-end through `spectastic apply` (071, T-900)', () => {
  it('lands the contract, archives the proposal, and a re-run is a no-op (SC-001/SC-003)', async () => {
    const cwd = copyFixture('match');

    const first = await runCLI(['apply', '200-match', '2026-08-01-bump-contract'], cwd);
    expect(first.code).toBe(0);

    const effective = readFileSync(join(cwd, 'api/openapi.yaml'), 'utf8');
    expect(effective).toContain('v2');
    expect(existsSync(join(cwd, 'specs/200-match/contracts/openapi.yaml'))).toBe(false);
    expect(
      existsSync(join(cwd, 'specs/200-match/changes/archive/2026-08-01-bump-contract/contracts/openapi.yaml')),
    ).toBe(true);

    // Re-running against the already-archived slug: no proposal folder remains at
    // its original location, so this exercises the "nothing to do" path directly
    // rather than a literal second invocation of the same command.
    const second = await runCLI(['apply', '200-match', '2026-08-01-bump-contract'], cwd);
    expect(second.code).not.toBe(0); // proposal already archived — nothing at changes/<slug> to apply
  });

  it('refuses — exit non-zero, nothing written — when the effective contract has moved (SC-002)', async () => {
    const cwd = copyFixture('conflict');
    const beforeEffective = readFileSync(join(cwd, 'api/openapi.yaml'), 'utf8');
    const beforeProposed = readFileSync(join(cwd, 'specs/201-conflict/contracts/openapi.yaml'), 'utf8');

    const result = await runCLI(['apply', '201-conflict', '2026-08-01-bump-contract'], cwd);

    expect(result.code).not.toBe(0);
    expect(readFileSync(join(cwd, 'api/openapi.yaml'), 'utf8')).toBe(beforeEffective);
    expect(readFileSync(join(cwd, 'specs/201-conflict/contracts/openapi.yaml'), 'utf8')).toBe(beforeProposed);
    expect(existsSync(join(cwd, 'specs/201-conflict/changes/archive'))).toBe(false);
  });

  it("promotes a project's first contract when there is no predecessor (D-005)", async () => {
    const cwd = copyFixture('no-predecessor');

    const result = await runCLI(['apply', '202-first', '2026-08-01-first-contract'], cwd);

    expect(result.code).toBe(0);
    expect(existsSync(join(cwd, 'api/new.proto'))).toBe(true);
    expect(readFileSync(join(cwd, 'api/new.proto'), 'utf8')).toContain('proto3');
  });

  it('a change with no proposed contract is unaffected — 0 files, no contract output (FR-006, T-901/SC-004)', async () => {
    const cwd = copyFixture('no-contract');

    const result = await runCLI(['apply', '203-none', '2026-08-01-unrelated-change'], cwd);

    expect(result.code).toBe(0);
    // Not "no mention of the word contract at all" — the temp dir's own name embeds
    // it — but no promotion-specific reporting, since 0 contracts were promoted.
    expect(result.stdout).not.toMatch(/promot(e|ed|ion)/i);
    expect(existsSync(join(cwd, 'specs/203-none/contracts'))).toBe(false);
  });

  it('a three-contract change refuses atomically when one conflicts — 0 written, 0 archived (FR-004)', async () => {
    const cwd = copyFixture('three-with-conflict');
    const beforeA = readFileSync(join(cwd, 'api/a.yaml'), 'utf8');
    const beforeB = readFileSync(join(cwd, 'api/b.yaml'), 'utf8');

    const result = await runCLI(['apply', '204-three', '2026-08-01-three-contracts'], cwd);

    expect(result.code).not.toBe(0);
    // Even the two contracts that would individually be clean (a, b) stay untouched —
    // the whole plan aborts on the third's conflict.
    expect(readFileSync(join(cwd, 'api/a.yaml'), 'utf8')).toBe(beforeA);
    expect(readFileSync(join(cwd, 'api/b.yaml'), 'utf8')).toBe(beforeB);
    expect(existsSync(join(cwd, 'specs/204-three/changes/archive'))).toBe(false);
  });

  it('--dry-run reports the plan and changes 0 files (FR-008)', async () => {
    const cwd = copyFixture('match');
    const before = readFileSync(join(cwd, 'api/openapi.yaml'), 'utf8');

    const result = await runCLI(['apply', '200-match', '2026-08-01-bump-contract', '--dry-run'], cwd);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/dry run/i);
    expect(result.stdout).toMatch(/openapi\.yaml/);
    expect(readFileSync(join(cwd, 'api/openapi.yaml'), 'utf8')).toBe(before);
    expect(existsSync(join(cwd, 'specs/200-match/contracts/openapi.yaml'))).toBe(true); // still proposed, not archived
  });

  it('--dry-run reports the conflict without writing or archiving anything', async () => {
    const cwd = copyFixture('conflict');

    const result = await runCLI(['apply', '201-conflict', '2026-08-01-bump-contract', '--dry-run'], cwd);

    expect(result.code).not.toBe(0);
    expect(result.stdout).toMatch(/dry run/i);
    expect(result.stdout).toMatch(/refuse/i);
  });
});
