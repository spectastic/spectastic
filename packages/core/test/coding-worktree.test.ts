import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { GitWorktreeSandbox } from '../src/coding/worktree.js';

/**
 * US2 (SC-002) — the git worktree sandbox isolates the coding run: a discarded
 * run leaves the primary tree byte-for-byte unchanged; an accepted run transfers
 * exactly the worktree's net change into the primary tree. Real git, temp repo.
 */

const exec = promisify(execFile);
const repos: string[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd });
  return stdout;
}

/** A fresh temp git repo with one committed file. */
async function repo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wt-repo-'));
  repos.push(dir);
  await git(dir, 'init', '-q');
  await git(dir, 'config', 'user.email', 't@t.co');
  await git(dir, 'config', 'user.name', 'T');
  await writeFile(join(dir, 'kept.txt'), 'original\n', 'utf8');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

describe('GitWorktreeSandbox — isolation (038 US2, SC-002)', () => {
  it('discard leaves the primary tree byte-for-byte unchanged', async () => {
    const dir = await repo();
    const before = await git(dir, 'status', '--porcelain');
    const keptBefore = await readFile(join(dir, 'kept.txt'), 'utf8');

    const handle = await new GitWorktreeSandbox().create(dir);
    await writeFile(join(handle.dir, 'new.txt'), 'agent junk\n', 'utf8');
    await writeFile(join(handle.dir, 'kept.txt'), 'agent mangled\n', 'utf8');
    await handle.discard();

    expect(await git(dir, 'status', '--porcelain')).toBe(before); // still clean
    expect(existsSync(join(dir, 'new.txt'))).toBe(false); // agent's file never landed
    expect(await readFile(join(dir, 'kept.txt'), 'utf8')).toBe(keptBefore); // unmodified
  });

  it('accept transfers the net change into the primary tree', async () => {
    const dir = await repo();

    const handle = await new GitWorktreeSandbox().create(dir);
    await writeFile(join(handle.dir, 'new.txt'), 'accepted\n', 'utf8');
    await writeFile(join(handle.dir, 'kept.txt'), 'changed\n', 'utf8');
    await handle.accept();

    expect(existsSync(join(dir, 'new.txt'))).toBe(true);
    expect(await readFile(join(dir, 'new.txt'), 'utf8')).toBe('accepted\n');
    expect(await readFile(join(dir, 'kept.txt'), 'utf8')).toBe('changed\n');
    // The worktree is gone.
    expect(existsSync(handle.dir)).toBe(false);
  });

  it('refuses when the base is not a git repo', async () => {
    const notRepo = await mkdtemp(join(tmpdir(), 'wt-plain-'));
    repos.push(notRepo);
    await expect(new GitWorktreeSandbox().create(notRepo)).rejects.toThrow(/not a git repository/);
  });
});
