import { describe, expect, it } from 'vitest';
import { branchName, commitSubject, scopeOf, shouldCreateBranch, VERB_GIT_MAP } from '../src/git/derive.js';

/**
 * T-012 of specs/026-git-strategy/tasks.html. Unit tests for pure derivation
 * (FR-002, FR-003, FR-005, plan D-006): subject grammar, branch name, and the
 * verb→git map (only spec branches; small-work verbs never do).
 */

describe('scopeOf / commitSubject (FR-002)', () => {
  it('scope is the numeric prefix of the spec id', () => {
    expect(scopeOf('026-git-strategy')).toBe('026');
    expect(scopeOf('000-spectastic')).toBe('000');
  });

  it('falls back to the whole id when there is no numeric prefix', () => {
    expect(scopeOf('foo-bar')).toBe('foo-bar');
  });

  it('renders <verb>(NNN): <subject>', () => {
    expect(commitSubject('spec', '026-git-strategy', 'git strategy — the opt-in git layer')).toBe(
      'spec(026): git strategy — the opt-in git layer',
    );
    expect(commitSubject('implement', '026-git-strategy', 'T-010..015 foundational')).toBe(
      'implement(026): T-010..015 foundational',
    );
  });

  // T-1001: the unscoped form for spec-less verbs (FR-002/FR-007, applied
  // change 2026-06-29-unscoped-commit-spec-less-verbs).
  it('omits the scope entirely when there is no spec id', () => {
    expect(commitSubject('triage', '', 'triage 5 inbox items')).toBe('triage: triage 5 inbox items');
    expect(commitSubject('principles', undefined, 'ratify v1.2')).toBe('principles: ratify v1.2');
    expect(commitSubject('implement', '', 'drain inbox card I-042')).toBe('implement: drain inbox card I-042');
  });

  it('a whitespace-only spec id is treated as absent (unscoped, never faked)', () => {
    expect(commitSubject('triage', '   ', 'x')).toBe('triage: x');
    // and the scoped form is untouched by the new branch
    expect(commitSubject('plan', '012-core-plan', 'stack + ADRs')).toBe('plan(012): stack + ADRs');
  });
});

describe('branchName (FR-003)', () => {
  it('is the full NNN-slug', () => {
    expect(branchName('026-git-strategy')).toBe('026-git-strategy');
  });
});

describe('VERB_GIT_MAP / shouldCreateBranch (FR-003, FR-005)', () => {
  it('only spec may create a branch', () => {
    expect(VERB_GIT_MAP.spec.createsBranch).toBe(true);
    for (const v of ['plan', 'tasks', 'implement', 'propose', 'apply', 'triage', 'principles'] as const) {
      expect(VERB_GIT_MAP[v].createsBranch).toBe(false);
    }
  });

  it('branches only under branch+commit, for spec, on a new slice', () => {
    expect(shouldCreateBranch('spec', 'branch+commit', true)).toBe(true);
    expect(shouldCreateBranch('spec', 'branch+commit', false)).toBe(false); // re-entry
    expect(shouldCreateBranch('spec', 'commit', true)).toBe(false); // commit-only
    expect(shouldCreateBranch('triage', 'branch+commit', true)).toBe(false); // small-work
    expect(shouldCreateBranch('implement', 'branch+commit', true)).toBe(false);
  });
});
