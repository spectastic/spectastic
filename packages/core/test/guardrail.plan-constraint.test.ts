import { describe, expect, it } from 'vitest';
import {
  extractDeclaredSurface,
  planConstraintFindings,
  scopeOverlap,
  type DesignDoc,
} from '../src/guardrail/plan-constraint.js';
import { isPlanConstraintGatedTier } from '../src/guardrail/gated-tiers.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * Slice 3a plan-stage constraint (spec 114, FR-001..FR-004/FR-006, SC-001/SC-004).
 * Tests-first per the design brief's Phase-3 rule.
 */

const D = (o: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  ...o,
});

const designWithTree = (specId: string, treeLines: string[], extra = ''): DesignDoc => ({
  specId,
  file: `specs/${specId}/design.html`,
  html: `<section id="project-structure"><pre><code>${treeLines.join('\n')}</code></pre></section>${extra}`,
});

describe('extractDeclaredSurface', () => {
  it('extracts path tokens, strips comments and trailing slashes', () => {
    const s = extractDeclaredSurface(
      '<section id="project-structure"><pre><code>packages/core/src/  # a comment\nscripts/build.mjs\nprose line no path</code></pre></section>',
    );
    expect(s).toEqual(['packages/core/src', 'scripts/build.mjs']);
  });
  it('returns [] when there is no structure block', () => {
    expect(extractDeclaredSurface('<p>no tree here</p>')).toEqual([]);
  });
});

describe('scopeOverlap (token within the governed area only)', () => {
  it('matches when a glob matches a declared token', () => {
    expect(scopeOverlap(['src/**/persistence/**'], ['src/app/persistence/Repo.java'])).not.toBeNull();
  });
  it('matches when the declared token is the governed dir', () => {
    expect(scopeOverlap(['packages/core/src/guardrail/**'], ['packages/core/src/guardrail'])).not.toBeNull();
  });
  it('matches when the declared token is under the governed dir', () => {
    expect(scopeOverlap(['packages/core/src/guardrail/**'], ['packages/core/src/guardrail/glob.ts'])).not.toBeNull();
  });
  it('does NOT match a coarse ancestor of the scope (the T-900 over-fire fix)', () => {
    // Declaring a broad ancestor like packages/core must not conscript every
    // narrow decision beneath it — that fired the gate on ~97 designs.
    expect(scopeOverlap(['packages/core/src/guardrail/**'], ['packages/core'])).toBeNull();
  });
  it('does not match an unrelated surface', () => {
    expect(scopeOverlap(['src/**/persistence/**'], ['docs', 'README.md'])).toBeNull();
  });
});

describe('planConstraintFindings', () => {
  const decisions: GovernanceDecision[] = [
    D({ id: 'D-007', specId: '002-downstream', status: 'accepted', paths: ['src/**/persistence/**'] }),
    D({ id: 'D-050', specId: '003-proposed', status: 'proposed', paths: ['src/**/persistence/**'] }),
  ];

  it('errors when a design touches a governed path without acknowledgment (SC-001)', () => {
    const design = designWithTree('009-recon', ['src/recon/persistence/Job.java']);
    const f = planConstraintFindings([design], decisions);
    expect(f.length).toBe(1);
    expect(f[0]?.severity).toBe('error');
    expect(f[0]?.rule).toBe('plan-constraint');
    expect(f[0]?.message).toMatch(/002-downstream\/D-007/);
    expect(f[0]?.message).toMatch(/persistence/);
  });

  it('clears when the design acknowledges the decision by its coordinate tail (FR-001)', () => {
    const design = designWithTree(
      '009-recon',
      ['src/recon/persistence/Job.java'],
      '<p>Honours 002-downstream/D-007 by emitting events through the use case.</p>',
    );
    expect(planConstraintFindings([design], decisions)).toEqual([]);
  });

  it("does not require a design to acknowledge its OWN decision (FR-004)", () => {
    const own = [D({ id: 'D-001', specId: '009-recon', status: 'accepted', paths: ['src/recon/**'] })];
    const design = designWithTree('009-recon', ['src/recon/persistence/Job.java']);
    expect(planConstraintFindings([design], own)).toEqual([]);
  });

  it('ignores proposed decisions (only accepted govern)', () => {
    const design = designWithTree('009-recon', ['src/recon/persistence/Job.java']);
    const f = planConstraintFindings([design], [decisions[1]!]); // the proposed one
    expect(f).toEqual([]);
  });

  it('binds forward-only: an ACCEPTED design touching a governed path is NOT flagged', () => {
    const accepted: DesignDoc = {
      specId: '009-recon',
      file: 'specs/009-recon/design.html',
      html: `<spec-status value="accepted">Accepted</spec-status><section id="project-structure"><pre><code>src/recon/persistence/Job.java</code></pre></section>`,
    };
    expect(planConstraintFindings([accepted], decisions)).toEqual([]);
  });

  it('is deterministic across runs', () => {
    const design = designWithTree('009-recon', ['src/recon/persistence/Job.java']);
    expect(planConstraintFindings([design], decisions)).toEqual(planConstraintFindings([design], decisions));
  });
});

describe('isPlanConstraintGatedTier (FR-006 / SC-004)', () => {
  it('gates at standard and above', () => {
    expect(isPlanConstraintGatedTier('standard')).toBe(true);
    expect(isPlanConstraintGatedTier('verified')).toBe(true);
    expect(isPlanConstraintGatedTier('enterprise')).toBe(true);
  });
  it('does not gate below standard or with no marker', () => {
    expect(isPlanConstraintGatedTier('lite')).toBe(false);
    expect(isPlanConstraintGatedTier(undefined)).toBe(false);
  });
});
