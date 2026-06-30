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
  it('absent spectastic.json → defaults (auto+trailers off)', () => {
    expect(loadGitConfig(tmpProject())).toEqual({ auto: 'off', trailers: 'off' });
  });

  it('present file with no git section → defaults', () => {
    expect(loadGitConfig(tmpProject('{ "unrelated": true }'))).toEqual({ auto: 'off', trailers: 'off' });
  });

  it('git section with no keys → defaults', () => {
    expect(loadGitConfig(tmpProject('{ "git": {} }'))).toEqual({ auto: 'off', trailers: 'off' });
  });

  it.each(['off', 'commit', 'branch+commit'] as const)('parses git.auto=%s', (auto) => {
    expect(loadGitConfig(tmpProject(`{ "git": { "auto": "${auto}" } }`))).toEqual({ auto, trailers: 'off' });
  });

  // T-003: the git.trailers key (spec 027, FR-001).
  it.each(['off', 'on'] as const)('parses git.trailers=%s', (trailers) => {
    expect(loadGitConfig(tmpProject(`{ "git": { "trailers": "${trailers}" } }`))).toEqual({
      auto: 'off',
      trailers,
    });
  });

  it('rejects an unknown git.auto value loudly', () => {
    expect(() => loadGitConfig(tmpProject('{ "git": { "auto": "yolo" } }'))).toThrow(GitConfigError);
  });

  it('rejects an unknown git.trailers value loudly', () => {
    expect(() => loadGitConfig(tmpProject('{ "git": { "trailers": "maybe" } }'))).toThrow(GitConfigError);
  });

  it('rejects malformed JSON loudly', () => {
    expect(() => loadGitConfig(tmpProject('{ not json'))).toThrow(GitConfigError);
  });

  it('rejects a non-object git section', () => {
    expect(() => loadGitConfig(tmpProject('{ "git": "off" }'))).toThrow(GitConfigError);
  });
});
