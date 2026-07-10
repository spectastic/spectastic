import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  UnknownProfileError,
  loadProfiles,
  profileNames,
  resolveProfile,
} from '../../src/commands/init/profiles.js';

/** Unit tests for the profile manifest loader (spec 041 T-011 / T-210). */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..', '..');

describe('profiles: loadProfiles', () => {
  const manifest = loadProfiles(REPO_ROOT);

  it('loads the four named profiles in order', () => {
    expect(profileNames(manifest)).toEqual(['lean', 'standard', 'verified', 'enterprise']);
  });

  it('each profile carries axes', () => {
    for (const name of profileNames(manifest)) {
      expect(Object.keys(resolveProfile(manifest, name).axes).length).toBeGreaterThan(0);
    }
  });

  it('fails safe to an empty manifest for a missing file', () => {
    const empty = loadProfiles('/no/such/dir');
    expect(profileNames(empty)).toEqual([]);
  });
});

describe('profiles: resolveProfile', () => {
  const manifest = loadProfiles(REPO_ROOT);

  it('resolves a known name', () => {
    expect(resolveProfile(manifest, 'verified').name).toBe('verified');
  });

  it('throws UnknownProfileError listing the valid names', () => {
    try {
      resolveProfile(manifest, 'pro');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownProfileError);
      expect((err as UnknownProfileError).message).toContain('lean, standard, verified, enterprise');
    }
  });
});
