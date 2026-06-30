import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveNextSpecId, highestNumberInDirs, slugify } from '../src/git/allocate.js';
import type { GitRunner } from '../src/git/run.js';

/**
 * T-104 of specs/026-git-strategy/tasks.html. Unit tests for origin-aware id
 * allocation (FR-006, plan D-004): local scan; origin path via an injected
 * runner; no-remote / fetch-timeout → local fallback.
 */

const dirs: string[] = [];
function tmpProject(specIds: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-allocate-'));
  dirs.push(dir);
  for (const id of specIds) mkdirSync(join(dir, 'specs', id), { recursive: true });
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fake runner: configurable default branch, fetch outcome, and origin dirs. */
function fakeRunner(opts: {
  def?: string | null;
  fetchOk?: boolean;
  originDirs?: string[];
}): GitRunner {
  return {
    currentBranch: async () => 'main',
    headSubject: async () => '',
    add: async () => {},
    commit: async () => {},
    createBranch: async () => {},
    defaultBranch: async () => opts.def ?? null,
    fetchDefault: async () => opts.fetchOk ?? false,
    lsTreeSpecDirs: async () => opts.originDirs ?? [],
  };
}

describe('helpers', () => {
  it('highestNumberInDirs picks the max NNN prefix', () => {
    expect(highestNumberInDirs(['024-a', '025-b', 'notes', '003-c'])).toBe(25);
    expect(highestNumberInDirs([])).toBe(0);
  });
  it('slugify lowercases and dashes', () => {
    expect(slugify('Git Strategy — the opt-in git layer')).toBe('git-strategy-the-opt-in-git-layer');
  });
});

describe('resolveNextSpecId (T-104)', () => {
  it('local scan only when no runner is given', async () => {
    const cwd = tmpProject(['024-a', '025-b']);
    expect(await resolveNextSpecId(cwd, 'new feature')).toBe('026-new-feature');
  });

  it('takes the max of local and origin when the remote is reachable', async () => {
    const cwd = tmpProject(['024-a']); // local max 24
    const runner = fakeRunner({ def: 'main', fetchOk: true, originDirs: ['024-a', '030-remote'] });
    expect(await resolveNextSpecId(cwd, 'x', { runner })).toBe('031-x'); // origin 30 wins
  });

  it('falls back to local when the fetch times out / no remote', async () => {
    const cwd = tmpProject(['024-a', '025-b']);
    const offline = fakeRunner({ def: 'main', fetchOk: false, originDirs: ['099-should-be-ignored'] });
    expect(await resolveNextSpecId(cwd, 'x', { runner: offline })).toBe('026-x');

    const noRemote = fakeRunner({ def: null });
    expect(await resolveNextSpecId(cwd, 'x', { runner: noRemote })).toBe('026-x');
  });

  it('first slice in an empty project is 001', async () => {
    expect(await resolveNextSpecId(tmpProject(), 'first')).toBe('001-first');
  });
});
