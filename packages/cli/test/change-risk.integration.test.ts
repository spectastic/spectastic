import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Integration tests for `spectastic change-risk` (spec 049, US1 T-106).
 * Spawns the real binary over a real temp git fixture repo. Needs a fresh
 * build — run `pnpm --filter @spectastic/cli build` (and core) first.
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

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd });
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-changerisk-cli-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(join(dir, 'readme.txt'), 'hello\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'initial']);
  return dir;
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('change-risk: US1 default diff report (SC-001/SC-002)', () => {
  it('a binary + CI-edit diff prints two findings, a score, a band, and the disclaimer (SC-001)', async () => {
    const dir = initRepo();
    dirs.push(dir);
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0, 1, 2, 3, 255, 254, 0x89]));
    execFileSync('mkdir', ['-p', join(dir, '.github', 'workflows')]);
    writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\non: push\n');
    git(dir, ['add', '-A']);

    const r = await runCLI(['change-risk'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/binary-blob/);
    expect(r.stdout).toMatch(/build-script-edit/);
    expect(r.stdout).toMatch(/\d+\/100/);
    expect(r.stdout).toMatch(/green|amber|red/);
    expect(r.stdout.toLowerCase()).toContain('does not detect');

    // NFR-001: a repeat run is byte-identical.
    const r2 = await runCLI(['change-risk'], dir);
    expect(r2.stdout).toBe(r.stdout);
  });

  it('an empty diff prints zero findings, score 0, green, exit 0 (SC-002)', async () => {
    const dir = initRepo();
    dirs.push(dir);
    const r = await runCLI(['change-risk'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/0\/100/);
    expect(r.stdout).toContain('green');
  });

  it('a docs-only diff prints zero findings, score 0, green, exit 0 (SC-002)', async () => {
    const dir = initRepo();
    dirs.push(dir);
    writeFileSync(join(dir, 'readme.txt'), 'hello\nmore docs\n');
    git(dir, ['add', '-A']);
    const r = await runCLI(['change-risk'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/0\/100/);
    expect(r.stdout).toContain('green');
  });
});

describe('change-risk: US2 --range (FR-008 complete, FR-009)', () => {
  it('scans an explicit base..HEAD range, advisory exit 0 with no failAt set', async () => {
    const dir = initRepo();
    dirs.push(dir);
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

    writeFileSync(join(dir, 'logo.png'), Buffer.from([0, 1, 2, 3, 255, 254, 0x89]));
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'add binary']);

    const r = await runCLI(['change-risk', '--range', `${base}..HEAD`], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/binary-blob/);
    expect(r.stdout).toMatch(/\d+\/100/);
  });
});
