import { describe, expect, it } from 'vitest';
import { coverageReport } from '../src/guardrail/coverage.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * Slice 3a coverage report (spec 114, FR-005, SC-002). Tests-first.
 */

const D = (o: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  ...o,
});

const NOW = new Date('2026-09-13T00:00:00.000Z');

// Every decision carries a scope — coverage's population is decisions that
// govern code. An unscoped methodology note is excluded (asserted separately).
const CORPUS: GovernanceDecision[] = [
  D({ id: 'D-1', specId: '001', status: 'accepted', paths: ['a/**'], enforcement: { rules: [{ tool: 'archunit', id: 'r1' }] } }),
  D({ id: 'D-2', specId: '001', status: 'accepted', paths: ['b/**'], enforcement: { rules: [{ tool: 'semgrep', id: 'r2' }] } }),
  D({ id: 'D-3', specId: '002', status: 'accepted', paths: ['c/**'], enforcement: { rules: [], none: { reason: 'DB grant' } } }),
  D({ id: 'D-4', specId: '002', status: 'accepted', paths: ['d/**'] }), // scoped, neither checked nor excused = the blind spot
  D({ id: 'D-5', specId: '003', status: 'proposed', paths: ['e/**'], enforcement: { rules: [{ tool: 'x', id: 'r' }] } }), // inactive
  D({ id: 'D-6', specId: '003', status: 'accepted', paths: ['f/**'], reviewBy: '2020-01-01', enforcement: { rules: [{ tool: 'x', id: 'r6' }] } }),
];

describe('coverageReport', () => {
  const r = coverageReport(CORPUS, { now: NOW });

  it('counts only active decisions: 2 checked + 1 excused + 1 uncovered + 1 past-review = 4 active', () => {
    // active = D-1,D-2,D-3,D-4,D-6 (D-5 is proposed). checked = D-1,D-2,D-6 = 3.
    expect(r.total).toBe(5);
    expect(r.checked).toBe(3);
    expect(r.excused).toBe(1);
    expect(r.uncovered).toBe(1);
  });

  it('reports the proportion checked / total', () => {
    expect(r.proportion).toBeCloseTo(3 / 5, 5);
  });

  it('warns on the neither-checked-nor-excused decision (D-4)', () => {
    const w = r.findings.find((f) => f.message.includes('002/D-4'));
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/no executable check/);
  });

  it('warns on the past-review-by decision (D-6)', () => {
    const w = r.findings.find((f) => f.message.includes('003/D-6') && /review-by/.test(f.message));
    expect(w).toBeTruthy();
    expect(w?.severity).toBe('warning');
  });

  it('every finding is a non-blocking warning', () => {
    expect(r.findings.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('is deterministic under a pinned clock (SC-002)', () => {
    expect(coverageReport(CORPUS, { now: NOW })).toEqual(coverageReport(CORPUS, { now: NOW }));
  });

  it('an empty corpus is vacuously covered (proportion 1, no findings)', () => {
    const e = coverageReport([], { now: NOW });
    expect(e.proportion).toBe(1);
    expect(e.findings).toEqual([]);
  });

  it('excludes an unscoped methodology decision from the population', () => {
    const methodology = [D({ id: 'D-9', specId: '004', status: 'accepted' })]; // no paths
    const r2 = coverageReport(methodology, { now: NOW });
    expect(r2.total).toBe(0);
    expect(r2.findings).toEqual([]);
  });
});
