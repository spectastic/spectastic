import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ChangeRiskDiffError, getDiff } from '../src/change-risk/diff.js';

/**
 * Unit tests for the git diff adapter (spec 049 FR-008 default half, plan
 * D-001/D-005). Exercises a real temp git fixture repo — the D-005 spike
 * findings (binary → `Binary files … differ` + numstat `-\t-`) as executable
 * assertions.
 */

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-diff-'));
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

describe('getDiff — default uncommitted diff (working tree + staged)', () => {
  it('captures a staged text change', async () => {
    const dir = initRepo();
    dirs.push(dir);
    writeFileSync(join(dir, 'readme.txt'), 'hello\nworld\n');
    git(dir, ['add', '-A']);
    const { patch, numstat } = await getDiff(dir);
    expect(patch).toContain('+world');
    expect(numstat).toContain('readme.txt');
  });

  it('captures an unstaged text change', async () => {
    const dir = initRepo();
    dirs.push(dir);
    writeFileSync(join(dir, 'readme.txt'), 'hello\nunstaged\n');
    const { patch } = await getDiff(dir);
    expect(patch).toContain('+unstaged');
  });

  it('flags a staged binary addition via numstat, per the D-005 spike', async () => {
    const dir = initRepo();
    dirs.push(dir);
    writeFileSync(join(dir, 'logo.png'), Buffer.from([0, 1, 2, 3, 255, 254, 0x89]));
    git(dir, ['add', '-A']);
    const { patch, numstat } = await getDiff(dir);
    expect(patch).toContain('Binary files /dev/null and b/logo.png differ');
    expect(numstat).toMatch(/-\s+-\s+logo\.png/);
  });

  it('returns an empty patch on no changes', async () => {
    const dir = initRepo();
    dirs.push(dir);
    const { patch, numstat } = await getDiff(dir);
    expect(patch.trim()).toBe('');
    expect(numstat.trim()).toBe('');
  });

  it('errors clearly on a non-git-repo directory (spec edge case — never a silent pass)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-notgit-'));
    dirs.push(dir);
    await expect(getDiff(dir)).rejects.toThrow(ChangeRiskDiffError);
  });
});

describe('getDiff — explicit range (US2, FR-008 complete)', () => {
  it('resolves an explicit base..head range, ignoring uncommitted changes outside it', async () => {
    const dir = initRepo();
    dirs.push(dir);
    const base = git(dir, ['rev-parse', 'HEAD']).trim();

    writeFileSync(join(dir, 'readme.txt'), 'hello\ncommitted\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'second']);
    const head = git(dir, ['rev-parse', 'HEAD']).trim();

    // An uncommitted change outside the range — must not leak into the range diff.
    writeFileSync(join(dir, 'readme.txt'), 'hello\ncommitted\nuncommitted\n');

    const { patch } = await getDiff(dir, `${base}..${head}`);
    expect(patch).toContain('+committed');
    expect(patch).not.toContain('+uncommitted');
  });

  it('falls back to the default diff when range is omitted', async () => {
    const dir = initRepo();
    dirs.push(dir);
    writeFileSync(join(dir, 'readme.txt'), 'hello\nworld\n');
    git(dir, ['add', '-A']);
    const { patch } = await getDiff(dir);
    expect(patch).toContain('+world');
  });

  it('errors clearly on an invalid range (spec edge case — never a silent pass)', async () => {
    const dir = initRepo();
    dirs.push(dir);
    await expect(getDiff(dir, 'not-a-real-ref..HEAD')).rejects.toThrow(ChangeRiskDiffError);
  });
});
