import { describe, it, expect } from 'vitest';
import { buildCoverage } from './coverage.js';
import type { CandidateChild } from './types.js';

/**
 * US2 (T-200): the coverage partition is total + disjoint — every parent FR/NFR/SC
 * assigned exactly once; gaps and duplicates flagged (FR-005, SC-001).
 */

const parent = `<!doctype html><html><body>
<spec-requirement id="FR-001" priority="must"><p>a</p></spec-requirement>
<spec-requirement id="FR-002" priority="must"><p>b</p></spec-requirement>
<spec-requirement id="SC-001" priority="must"><p>c</p></spec-requirement>
</body></html>`;

function child(specId: string, ids: string[]): CandidateChild {
  return {
    specId,
    title: specId,
    scope: '',
    assignedRequirementIds: ids,
    dependsOn: [],
    rice: { reach: 1, impact: 1, confidence: 1, effort: 1 },
    riceConfirmed: true,
  };
}

describe('buildCoverage', () => {
  it('is total + disjoint when every requirement is assigned exactly once', () => {
    const cov = buildCoverage(parent, [child('001-a', ['FR-001']), child('002-b', ['FR-002', 'SC-001'])]);
    expect(cov.isTotalAndDisjoint).toBe(true);
    expect(cov.unassigned).toEqual([]);
    expect(cov.duplicated).toEqual([]);
  });

  it('flags unassigned requirements (partition not total)', () => {
    const cov = buildCoverage(parent, [child('001-a', ['FR-001'])]);
    expect(cov.isTotalAndDisjoint).toBe(false);
    expect(cov.unassigned).toEqual(['FR-002', 'SC-001']);
  });

  it('flags a duplicated requirement (partition not disjoint)', () => {
    const cov = buildCoverage(parent, [
      child('001-a', ['FR-001', 'FR-002']),
      child('002-b', ['FR-002', 'SC-001']),
    ]);
    expect(cov.duplicated).toEqual(['FR-002']);
    expect(cov.isTotalAndDisjoint).toBe(false);
  });
});
