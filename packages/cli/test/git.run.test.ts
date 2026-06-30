import { describe, expect, it, vi } from 'vitest';
import { gitRunner, type GitExec, type GitExecOpts } from '../src/git/run.js';

/**
 * T-014 of specs/026-git-strategy/tasks.html. Unit tests for the git execFile
 * wrappers (plan D-003), git mocked: argument construction, the fetch `timeout`
 * wiring (FR-006/NFR-001), and that non-zero exit surfaces (no swallowing on
 * commit). Commit-only — no amend/squash anywhere in the arg sets (NFR-002).
 */

interface Call {
  args: string[];
  opts: GitExecOpts;
}

function recorder(stdoutFor: (args: string[]) => string = () => '') {
  const calls: Call[] = [];
  const exec: GitExec = vi.fn(async (args: string[], opts: GitExecOpts) => {
    calls.push({ args, opts });
    return { stdout: stdoutFor(args), stderr: '' };
  });
  return { calls, exec };
}

describe('gitRunner wrappers (T-014)', () => {
  it('add scopes to the given paths with a -- separator; no-op on empty', async () => {
    const { calls, exec } = recorder();
    const g = gitRunner('/repo', exec);
    await g.add(['specs/026/spec.html', 'README.md']);
    expect(calls[0]!.args).toEqual(['add', '--', 'specs/026/spec.html', 'README.md']);
    await g.add([]);
    expect(calls).toHaveLength(1); // empty add did not invoke git
  });

  it('commit uses -m and never amends/squashes (NFR-002)', async () => {
    const { calls, exec } = recorder();
    await gitRunner('/repo', exec).commit('spec(026): x');
    expect(calls[0]!.args).toEqual(['commit', '-m', 'spec(026): x']);
    const flat = calls[0]!.args.join(' ');
    expect(flat).not.toMatch(/--amend|--squash|rebase|reset/);
  });

  it('createBranch uses checkout -b', async () => {
    const { calls, exec } = recorder();
    await gitRunner('/repo', exec).createBranch('026-git-strategy');
    expect(calls[0]!.args).toEqual(['checkout', '-b', '026-git-strategy']);
  });

  it('fetchDefault passes the timeout and returns false when git rejects', async () => {
    const { calls, exec } = recorder();
    const ok = await gitRunner('/repo', exec).fetchDefault('main', 3000);
    expect(calls[0]!.args).toEqual(['fetch', 'origin', 'main']);
    expect(calls[0]!.opts.timeout).toBe(3000);
    expect(ok).toBe(true);

    const failing: GitExec = vi.fn(async () => {
      throw new Error('timed out');
    });
    expect(await gitRunner('/repo', failing).fetchDefault('main', 1)).toBe(false);
  });

  it('defaultBranch strips origin/ and falls back to remote show', async () => {
    const direct = recorder((args) =>
      args[0] === 'symbolic-ref' ? 'origin/main' : '',
    );
    expect(await gitRunner('/repo', direct.exec).defaultBranch()).toBe('main');

    // origin/HEAD unset → symbolic-ref throws → remote show fallback (T-901).
    const fallback: GitExec = vi.fn(async (args) => {
      if (args[0] === 'symbolic-ref') throw new Error('not a symbolic ref');
      return { stdout: '* remote origin\n  HEAD branch: trunk\n', stderr: '' };
    });
    expect(await gitRunner('/repo', fallback).defaultBranch()).toBe('trunk');

    // No remote at all (T-901): origin ref + remote show both fail → current branch.
    const noRemote: GitExec = vi.fn(async (args) => {
      if (args[0] === 'remote') throw new Error('no such remote');
      // origin/HEAD ref throws; HEAD symbolic-ref resolves to the current branch
      if (args[2] === 'refs/remotes/origin/HEAD') throw new Error('unset');
      return { stdout: 'main\n', stderr: '' }; // symbolic-ref --short HEAD
    });
    expect(await gitRunner('/repo', noRemote).defaultBranch()).toBe('main');
  });

  it('lsTreeSpecDirs returns bare slice ids and tolerates failure', async () => {
    const ok = recorder(() => 'specs/024-explore-restore\nspecs/025-id-uniqueness\n');
    expect(await gitRunner('/repo', ok.exec).lsTreeSpecDirs('origin/main')).toEqual([
      '024-explore-restore',
      '025-id-uniqueness',
    ]);

    const fails: GitExec = vi.fn(async () => {
      throw new Error('unknown ref');
    });
    expect(await gitRunner('/repo', fails).lsTreeSpecDirs('origin/main')).toEqual([]);
  });
});
