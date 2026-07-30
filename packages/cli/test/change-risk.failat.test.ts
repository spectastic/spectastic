import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Integration tests for the opt-in `changeRisk.failAt` gate (spec 049 US3,
 * FR-007, SC-003). Spawns the real binary; no `failAt` configured must
 * always exit 0, and a configured `failAt` gates on the resolved score.
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
    const child = spawn('node', [CLI, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd });
}

/** A repo with one committed file and a staged binary addition — scores 40 (amber), one HIGH finding. */
function repoScoring40(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-changerisk-failat-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(join(dir, 'readme.txt'), 'hello\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'initial']);
  writeFileSync(join(dir, 'logo.png'), Buffer.from([0, 1, 2, 3, 255, 254, 0x89]));
  git(dir, ['add', '-A']);
  return dir;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('change-risk: US3 the opt-in failAt gate (SC-003)', () => {
  it('exits 0 for any score when failAt is not configured', async () => {
    const dir = repoScoring40();
    dirs.push(dir);
    const r = await runCLI(['change-risk'], dir);
    expect(r.stdout, r.stdout).toMatch(/40\/100/);
    expect(r.code).toBe(0);
  });

  it('exits non-zero when failAt is at or below the resolved score', async () => {
    const dir = repoScoring40();
    dirs.push(dir);
    writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ changeRisk: { failAt: 40 } }), 'utf8');
    const r = await runCLI(['change-risk'], dir);
    expect(r.stdout, r.stdout).toMatch(/40\/100/);
    expect(r.code).not.toBe(0);
  });

  it('exits 0 when failAt is above the resolved score', async () => {
    const dir = repoScoring40();
    dirs.push(dir);
    writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ changeRisk: { failAt: 41 } }), 'utf8');
    const r = await runCLI(['change-risk'], dir);
    expect(r.stdout, r.stdout).toMatch(/40\/100/);
    expect(r.code).toBe(0);
  });
});
