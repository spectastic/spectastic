import { describe, it, expect } from 'vitest';
import { buildSyntheticCorpus } from './corpus.js';
import { orderChildren } from './rank.js';
import type { CandidateChild } from './types.js';

/**
 * US1 (T-100): the synthetic corpus is acyclic + reciprocal, and the R-002 order
 * handoff places children in dependency order (FR-002, SC-003).
 */

function child(
  specId: string,
  o: { dependsOn?: string[]; rice: [number, number, number, number] },
): CandidateChild {
  return {
    specId,
    title: specId,
    scope: '',
    assignedRequirementIds: [],
    dependsOn: o.dependsOn ?? [],
    rice: { reach: o.rice[0], impact: o.rice[1], confidence: o.rice[2], effort: o.rice[3] },
    riceConfirmed: true,
  };
}

const ctx = { cwd: '.' };

describe('buildSyntheticCorpus', () => {
  it('serialises reciprocal stubs R-002 reads (child spec-parent + parent defer-to)', () => {
    const corpus = buildSyntheticCorpus([
      child('001-a', { rice: [5, 5, 1, 1] }),
      child('002-b', { dependsOn: ['001-a'], rice: [1, 1, 1, 1] }),
    ]);
    expect(corpus).toHaveLength(2);
    expect(corpus.find((e) => e.specId === '002-b')?.html).toContain('spec-parent specid="001-a"');
    expect(corpus.find((e) => e.specId === '001-a')?.html).toContain('defer-to="002-b"');
  });
});

describe('orderChildren', () => {
  it('orders a dependency before its dependent, even against RICE', async () => {
    // 002-b has higher RICE but depends on 001-a → 001-a must precede.
    const ordered = await orderChildren(
      [child('002-b', { dependsOn: ['001-a'], rice: [5, 5, 1, 1] }), child('001-a', { rice: [1, 1, 1, 1] })],
      ctx,
    );
    expect(ordered.map((c) => c.specId)).toEqual(['001-a', '002-b']);
  });

  it('ranks independent children by RICE value, highest first', async () => {
    const ordered = await orderChildren(
      [child('001-a', { rice: [1, 1, 1, 1] }), child('002-b', { rice: [5, 5, 1, 1] })],
      ctx,
    );
    expect(ordered.map((c) => c.specId)).toEqual(['002-b', '001-a']);
  });

  it('returns a single child untouched', async () => {
    const ordered = await orderChildren([child('001-a', { rice: [1, 1, 1, 1] })], ctx);
    expect(ordered.map((c) => c.specId)).toEqual(['001-a']);
  });
});
