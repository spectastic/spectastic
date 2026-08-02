import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

  /**
   * Spec 041-init-profiles, FR-010 (change 2026-08-02-axes-may-lead-the-floor)
   * — the machine half of "an axis value is never a guarantee".
   *
   * Axes declare posture and may deliberately run ahead of the enforced floor:
   * `contracts` is `contract-first` at standard while the `contract-first`
   * category only enters `enforce.required` at verified, and the axis leads at
   * verified and enterprise too. That divergence is legitimate ONLY while
   * nothing gates on an axis. The moment an enforcement path reads one, a value
   * would sometimes-but-not-always bind — the same confusion in the opposite
   * direction, and far harder to see.
   *
   * A source scan rather than a behavioural assertion, because the guarantee is
   * about what no code does; there is no call to make that would fail.
   */
  it('FR-010: no enforcement path reads a profile axis value', () => {
    const srcRoots = ['packages/core/src/enforce', 'packages/cli/src/commands/enforce.ts'];
    const offenders: string[] = [];
    for (const rel of srcRoots) {
      const abs = resolve(REPO_ROOT, rel);
      if (!existsSync(abs)) continue;
      const files = statSync(abs).isDirectory()
        ? readdirSync(abs)
            .filter((f) => f.endsWith('.ts'))
            .map((f) => resolve(abs, f))
        : [abs];
      for (const file of files) {
        if (/\.axes\b|\baxes\s*[:[]/.test(readFileSync(file, 'utf8'))) offenders.push(file);
      }
    }
    expect(offenders, 'an enforcement module reads a profile axis — FR-010 forbids gating on posture').toEqual([]);
  });

  /**
   * The reader-facing half of the same requirement. A clause about how a value
   * should be *read* is worth little if the surface implies the opposite, so
   * this pins what the audit found: axis values reach no generated artifact at
   * all. The profile marker carries only the profile name, and AGENTS.md states
   * the enforced floor (`enforce.required`) rather than a posture. If a future
   * change starts emitting an axis into project-facing output, this fails and
   * the copy question has to be answered deliberately.
   */
  it('FR-010: axis values are not emitted into project-facing output', () => {
    const compose = readFileSync(resolve(REPO_ROOT, 'packages/cli/src/commands/init/compose.ts'), 'utf8');
    expect(compose).not.toMatch(/\.axes\b/);
    // The floor is what gets stated to a reader — that much must stay true.
    expect(compose).toMatch(/enforce\.required|\brequired\b/);
  });

  /**
   * Spec 073-interface-detection-widening, FR-005 / T-901. The seeded
   * contract-first principle used to name three formats while the detector
   * accepted six — a project reading its own constitution could not learn
   * which artifacts satisfy the rule. This pins the copy to the detector's
   * actual accept-list so the two cannot silently drift apart again.
   */
  /**
   * Spec 074-contract-checked-tier, FR-005 / T-901. The rung can only see that
   * a check is CONFIGURED — never that it passes, never that it blocks a merge.
   * That ceiling is the same one coverage and observability carry, and stating
   * it is what keeps the floor credible. This pins the honesty clause so a
   * later edit cannot quietly upgrade "configured" into "passing".
   */
  it('the checked-contracts principle states configured, never passing (074, FR-005)', () => {
    for (const name of ['verified', 'enterprise']) {
      const principles = resolveProfile(manifest, name).principles ?? [];
      const statement = principles.find((p) => p.name === 'Checked contracts')?.statement ?? '';
      expect(statement, `${name} must seed the checked-contracts principle`).toBeTruthy();
      expect(statement, `${name} must name the linter`).toMatch(/linter/i);
      expect(statement, `${name} must name the breaking-change differ`).toMatch(/breaking-change differ/i);
      // The honesty clause itself.
      expect(statement, `${name} must say detection proves the check is configured`).toMatch(/configured/i);
      expect(statement, `${name} must disclaim that the check passes`).toMatch(/never that it passes/i);
      expect(statement, `${name} must disclaim that it blocks a merge`).toMatch(/blocks a merge/i);
    }
  });

  it('lean and standard are NOT given the checked-contracts principle — the rung is tier-gated (074, NFR-002)', () => {
    for (const name of ['lean', 'standard']) {
      const names = (resolveProfile(manifest, name).principles ?? []).map((p) => p.name);
      expect(names, `${name} must not seed the contract-checked rung`).not.toContain('Checked contracts');
    }
  });

  it('the contract-first principle names every format the detector accepts (FR-005)', () => {
    // Kept in step with isContractFile() in packages/core/src/enforce/detect.ts.
    const ACCEPTED_FORMATS = ['OpenAPI', 'Swagger', 'Protobuf', 'GraphQL SDL', 'AsyncAPI', 'JSON Schema'];

    const tiersSeedingIt = ['standard', 'verified', 'enterprise'];
    for (const name of tiersSeedingIt) {
      const principles = resolveProfile(manifest, name).principles ?? [];
      const contractFirst = principles.find((p) => p.name === 'Contract-first interfaces');
      expect(contractFirst, `${name} must seed the contract-first principle`).toBeDefined();
      for (const format of ACCEPTED_FORMATS) {
        expect(
          contractFirst?.statement,
          `${name}'s contract-first statement must name ${format} — the detector accepts it`,
        ).toContain(format);
      }
    }
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
    // Verified and enterprise each gained one more with 074-contract-checked-tier's
    // "Checked contracts" — a distinct principle rather than a tier-divergent copy
    // of "Contract-first interfaces", so the repeated-statement invariant above
    // still holds (that guard caught the first attempt, which modelled it wrong).
    expect(namesAt('standard')).toHaveLength(7);
    expect(namesAt('verified')).toHaveLength(11);
    expect(namesAt('enterprise')).toHaveLength(16);
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
