import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProfiles, profileNames, resolveProfile, UnknownProfileError } from '../../src/commands/init/profiles.js';

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

  // spec 041 2026-07-11-contracts-axis: the 6th axis expressing per-tier contract-rigor posture.
  it('every profile carries a non-empty contracts axis (the 6th axis)', () => {
    const posture: Record<string, string> = {
      lean: 'informal',
      standard: 'contract-first',
      verified: 'contract-checked',
      enterprise: 'versioned+governed',
    };
    for (const name of profileNames(manifest)) {
      const contracts = resolveProfile(manifest, name).axes.contracts;
      expect(contracts, `${name} must carry a contracts axis`).toBe(posture[name]);
    }
  });

  it('fails safe to an empty manifest for a missing file', () => {
    const empty = loadProfiles('/no/such/dir');
    expect(profileNames(empty)).toEqual([]);
  });
});

describe('profiles: principle drift guard', () => {
  const manifest = loadProfiles(REPO_ROOT);

  // The manifest has no cross-profile inheritance (combinedPrinciples composes
  // base + this-profile, deduped by name), so a principle seeded at a lower tier
  // is *repeated* into the higher tiers as a hand-maintained copy. This guards the
  // one gap that repetition opens: a later wording fix to one copy silently diverging
  // from the others. Any name appearing under more than one profile MUST carry an
  // identical statement across all of them.
  it('a principle repeated across tiers carries an identical statement', () => {
    const byName = new Map<string, Map<string, string>>(); // name -> (profile -> statement)
    for (const name of profileNames(manifest)) {
      for (const p of resolveProfile(manifest, name).principles) {
        const seen = byName.get(p.name) ?? new Map<string, string>();
        seen.set(name, p.statement);
        byName.set(p.name, seen);
      }
    }
    const drifted: string[] = [];
    for (const [principleName, byProfile] of byName) {
      const statements = new Set(byProfile.values());
      if (statements.size > 1) {
        drifted.push(`"${principleName}" diverges across ${[...byProfile.keys()].join(', ')}`);
      }
    }
    expect(drifted, `principle statements drifted across tiers:\n${drifted.join('\n')}`).toEqual([]);
  });
});

// spec 041 2026-07-18-profile-principle-catalog-next: semver + supply-chain hygiene
// repeated into standard/verified/enterprise; supply-chain provenance + accessibility
// conformance seeded enterprise-only (deliberately not repeated downward — see the
// proposal's §5 Risk 1: an unscoped a11y statement would be noise for non-UI projects
// at any tier, so it's scoped to the user-facing case rather than omitted or blanket).
describe('profiles: catalog-next tranche (semver, supply-chain, accessibility)', () => {
  const manifest = loadProfiles(REPO_ROOT);
  const namesAt = (profile: string) => resolveProfile(manifest, profile).principles.map((p) => p.name);

  it('semver + supply-chain hygiene are seeded at standard, verified, and enterprise', () => {
    for (const profile of ['standard', 'verified', 'enterprise']) {
      const names = namesAt(profile);
      expect(names, `${profile} principles`).toContain('Semantic versioning');
      expect(names, `${profile} principles`).toContain('Supply-chain hygiene');
    }
  });

  it('supply-chain provenance + accessibility conformance are enterprise-only, not repeated downward', () => {
    expect(namesAt('enterprise')).toContain('Supply-chain provenance');
    expect(namesAt('enterprise')).toContain('Accessibility conformance');
    for (const profile of ['lean', 'standard', 'verified']) {
      const names = namesAt(profile);
      expect(names, `${profile} principles`).not.toContain('Supply-chain provenance');
      expect(names, `${profile} principles`).not.toContain('Accessibility conformance');
    }
  });

  it('per-tier principle counts match the tranche (standard +2, verified +2, enterprise +4)', () => {
    expect(namesAt('standard')).toHaveLength(7);
    expect(namesAt('verified')).toHaveLength(10);
    expect(namesAt('enterprise')).toHaveLength(15);
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
