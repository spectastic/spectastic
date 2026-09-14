import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesGlob, normalisePath } from '../src/guardrail/glob.js';
import { decisionsForPaths } from '../src/guardrail/retrieve.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * Slice 2 retrieval + glob (spec 112, TBD-guardrail-retrieval, rubric item 2).
 * Tests-first per the design brief's Phase-3 rule.
 */

describe('glob matching', () => {
  it('** crosses path separators; * does not', () => {
    expect(matchesGlob('src/**', 'src/a/b/c.ts')).toBe(true);
    expect(matchesGlob('src/*', 'src/a/b.ts')).toBe(false);
    expect(matchesGlob('src/*', 'src/a.ts')).toBe(true);
  });
  it('**/ matches zero or more whole segments', () => {
    expect(matchesGlob('src/**/persistence/**', 'src/persistence/x.ts')).toBe(true);
    expect(matchesGlob('src/**/persistence/**', 'src/a/b/persistence/x.ts')).toBe(true);
    expect(matchesGlob('src/**/persistence/**', 'src/a/service/x.ts')).toBe(false);
  });
  it('**/*.sql matches an extension anywhere', () => {
    expect(matchesGlob('**/*.sql', 'a.sql')).toBe(true);
    expect(matchesGlob('**/*.sql', 'db/migrations/003.sql')).toBe(true);
    expect(matchesGlob('**/*.sql', 'db/migrations/003.ts')).toBe(false);
  });
  it('? matches exactly one non-separator char', () => {
    expect(matchesGlob('v?/api.ts', 'v1/api.ts')).toBe(true);
    expect(matchesGlob('v?/api.ts', 'v10/api.ts')).toBe(false);
  });
  it('regex specials in a glob are literal', () => {
    expect(matchesGlob('src/a.b/x.ts', 'src/a.b/x.ts')).toBe(true);
    expect(matchesGlob('src/a.b/x.ts', 'src/aXb/x.ts')).toBe(false);
  });
  it('normalises a leading ./ and backslashes', () => {
    expect(normalisePath('./src/a.ts')).toBe('src/a.ts');
    expect(matchesGlob('src/**', './src/a/b.ts')).toBe(true);
  });
  it('is deterministic — same glob compiles to the same source', () => {
    expect(globToRegExp('src/**/x').source).toBe(globToRegExp('src/**/x').source);
  });
});

const D = (over: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  ...over,
});

describe('decisionsForPaths', () => {
  const decisions: GovernanceDecision[] = [
    D({ id: 'D-007', specId: '002-downstream', status: 'accepted', paths: ['src/**/persistence/**'] }),
    D({ id: 'D-001', specId: '001-core', status: 'accepted', paths: ['src/**/persistence/**'] }),
    D({ id: 'D-050', specId: '003-other', status: 'proposed', paths: ['src/**/persistence/**'] }),
    D({ id: 'D-060', specId: '004-old', status: 'superseded', paths: ['src/**/persistence/**'] }),
    D({ id: 'D-070', specId: '005-elsewhere', status: 'accepted', paths: ['docs/**'] }),
  ];

  it('returns only accepted decisions whose scope matches, sorted by (specId, id)', () => {
    const m = decisionsForPaths(['src/app/persistence/Repo.java'], decisions);
    expect(m.map((x) => `${x.decision.specId}/${x.decision.id}`)).toEqual(['001-core/D-001', '002-downstream/D-007']);
  });

  it('excludes proposed, superseded, and non-matching decisions', () => {
    const m = decisionsForPaths(['src/app/persistence/Repo.java'], decisions);
    const ids = m.map((x) => x.decision.id);
    expect(ids).not.toContain('D-050'); // proposed
    expect(ids).not.toContain('D-060'); // superseded
    expect(ids).not.toContain('D-070'); // different scope
  });

  it('records which query paths each decision matched', () => {
    const m = decisionsForPaths(['src/a/persistence/X.java', 'src/b/service/Y.java'], decisions);
    expect(m[0]?.matchedPaths).toEqual(['src/a/persistence/X.java']);
  });

  it('is deterministic — identical result on repeated runs', () => {
    const paths = ['src/x/persistence/A.java', 'docs/readme.md'];
    expect(decisionsForPaths(paths, decisions)).toEqual(decisionsForPaths(paths, decisions));
  });

  it('an accepted decision with no scope path never governs', () => {
    const noScope = [D({ id: 'D-009', specId: '001-core', status: 'accepted', paths: [] })];
    expect(decisionsForPaths(['anything.ts'], noScope)).toEqual([]);
  });
});
