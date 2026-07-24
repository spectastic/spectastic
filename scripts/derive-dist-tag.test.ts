import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs release tooling, no type declarations by design.
import { deriveDistTags, fetchPublishedVersions, isPrerelease } from './derive-dist-tag.mjs';

// Spec 004 FR-006. These branches previously existed only as inline bash that
// ran for the first time during a live publish — the riskiest place to be wrong.

describe('deriveDistTags (FR-006)', () => {
  it('pre-release with no stable ever published → moves both next and latest', () => {
    // The pre-1.0 case that froze `latest` at 0.1.0-pre.3 for eighteen releases.
    expect(deriveDistTags('0.1.0-pre.19', ['0.1.0-pre.17', '0.1.0-pre.18'])).toEqual([
      'next',
      'latest',
    ]);
  });

  it('1.0.0-rc before any stable → still moves both (the RC-window gap)', () => {
    // A version-string rule keyed on "major is 0" would send this to `next` only
    // and re-freeze `latest` on the last 0.x for the whole RC period.
    expect(deriveDistTags('1.0.0-rc.1', ['0.1.0-pre.18'])).toEqual(['next', 'latest']);
  });

  it('pre-release once a stable exists → next only (the guard engages)', () => {
    expect(deriveDistTags('1.1.0-rc.1', ['0.1.0-pre.18', '1.0.0'])).toEqual(['next']);
  });

  it('bare semver → latest', () => {
    expect(deriveDistTags('1.0.0', ['0.1.0-pre.18'])).toEqual(['latest']);
  });

  it('first ever publish (registry empty) → both', () => {
    expect(deriveDistTags('0.1.0-pre.1', [])).toEqual(['next', 'latest']);
  });

  it('applies latest after next, so the ordering is deterministic', () => {
    const tags = deriveDistTags('0.1.0-pre.19', []);
    expect(tags.indexOf('latest')).toBeGreaterThan(tags.indexOf('next'));
  });
});

describe('isPrerelease', () => {
  it('classifies by the SemVer pre-release part', () => {
    expect(isPrerelease('0.1.0-pre.18')).toBe(true);
    expect(isPrerelease('1.0.0-rc.1')).toBe(true);
    expect(isPrerelease('1.0.0')).toBe(false);
  });
});

describe('fetchPublishedVersions', () => {
  it('parses the registry version list', async () => {
    const run = async () => ({ stdout: '["0.1.0-pre.17","0.1.0-pre.18"]', stderr: '' });
    expect(await fetchPublishedVersions('@spectastic/cli', run)).toEqual([
      '0.1.0-pre.17',
      '0.1.0-pre.18',
    ]);
  });

  it('normalises npm returning a bare string for a single version', async () => {
    const run = async () => ({ stdout: '"0.1.0-pre.1"', stderr: '' });
    expect(await fetchPublishedVersions('@spectastic/cli', run)).toEqual(['0.1.0-pre.1']);
  });

  it('treats a never-published package as no versions, not a failure', async () => {
    const run = async () => {
      throw Object.assign(new Error('npm error code E404'), { stderr: 'E404 Not Found' });
    };
    expect(await fetchPublishedVersions('@spectastic/brand-new', run)).toEqual([]);
  });

  it('throws when the registry state cannot be determined (FR-006: never guess)', async () => {
    // A network/rate-limit failure must fail the run rather than silently
    // resolving to "no stable exists" and wrongly promoting a pre-release.
    const run = async () => {
      throw Object.assign(new Error('ETIMEDOUT'), { stderr: 'network timeout' });
    };
    await expect(fetchPublishedVersions('@spectastic/cli', run)).rejects.toThrow(
      /could not determine published versions/,
    );
  });
});
