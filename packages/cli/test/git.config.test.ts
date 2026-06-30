import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGitConfig, GitConfigError } from '../src/git/config.js';

/**
 * T-010 of specs/026-git-strategy/tasks.html. Unit tests for the git.auto config
 * reader (FR-004, plan D-002): absent file → off; parse the tri-state; reject
 * unknown values and malformed JSON loudly.
 */

const dirs: string[] = [];
function tmpProject(json?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-gitconfig-'));
  dirs.push(dir);
  if (json !== undefined) writeFileSync(join(dir, 'spectastic.json'), json);
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('loadGitConfig (T-010)', () => {
  it('absent spectastic.json → auto:"off" (FR-004 default)', () => {
    expect(loadGitConfig(tmpProject())).toEqual({ auto: 'off' });
  });

  it('present file with no git section → off', () => {
    expect(loadGitConfig(tmpProject('{ "unrelated": true }'))).toEqual({ auto: 'off' });
  });

  it('git section with no auto key → off', () => {
    expect(loadGitConfig(tmpProject('{ "git": {} }'))).toEqual({ auto: 'off' });
  });

  it.each(['off', 'commit', 'branch+commit'] as const)('parses git.auto=%s', (auto) => {
    expect(loadGitConfig(tmpProject(`{ "git": { "auto": "${auto}" } }`))).toEqual({ auto });
  });

  it('rejects an unknown git.auto value loudly', () => {
    expect(() => loadGitConfig(tmpProject('{ "git": { "auto": "yolo" } }'))).toThrow(GitConfigError);
  });

  it('rejects malformed JSON loudly', () => {
    expect(() => loadGitConfig(tmpProject('{ not json'))).toThrow(GitConfigError);
  });

  it('rejects a non-object git section', () => {
    expect(() => loadGitConfig(tmpProject('{ "git": "off" }'))).toThrow(GitConfigError);
  });
});
