import { describe, expect, it } from 'vitest';
import { buildIndex, validateIndex } from '../src/decisions/index.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * Building and validating a decision index (spec 122-decision-index-federation,
 * FR-001 build; FR-005 the fail-closed reject list). Pure — no filesystem, no
 * network.
 */

const NOW = new Date('2026-09-20T00:00:00.000Z');
const PROJECT = 'acme/payments';

const D = (o: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  status: 'accepted',
  ...o,
});

describe('buildIndex', () => {
  it('includes an accepted decision carrying a path scope', () => {
    const idx = buildIndex([D({ id: 'D-001', specId: '002-x', paths: ['src/**'] })], PROJECT, NOW);
    expect(idx.decisions.map((d) => d.id)).toEqual(['D-001']);
  });

  it('includes an accepted decision carrying a module scope', () => {
    const idx = buildIndex([D({ id: 'D-001', specId: '002-x', modules: ['acme.x..'] })], PROJECT, NOW);
    expect(idx.decisions.map((d) => d.id)).toEqual(['D-001']);
  });

  it('includes an accepted decision carrying a resource scope', () => {
    const idx = buildIndex(
      [D({ id: 'D-001', specId: '002-x', resource: { coordinate: 'spectastic://acme/payments/datastore/x', owner: PROJECT } })],
      PROJECT,
      NOW,
    );
    expect(idx.decisions.map((d) => d.id)).toEqual(['D-001']);
  });

  it('excludes an accepted decision with no scope at all', () => {
    const idx = buildIndex([D({ id: 'D-001', specId: '002-x' })], PROJECT, NOW);
    expect(idx.decisions).toEqual([]);
  });

  it('excludes a decision that is not accepted', () => {
    const idx = buildIndex([D({ id: 'D-001', specId: '002-x', status: 'proposed', paths: ['src/**'] })], PROJECT, NOW);
    expect(idx.decisions).toEqual([]);
  });

  it('strips prose and each rule\'s run', () => {
    const decision = D({
      id: 'D-001',
      specId: '002-x',
      paths: ['src/**'],
      prose: 'The full narrative that stays in design.html.',
      enforcement: { rules: [{ tool: 'archunit', id: 'r1', run: 'gradle check' }] },
    } as Partial<GovernanceDecision>);
    const idx = buildIndex([decision], PROJECT, NOW);
    const out = idx.decisions[0] as unknown as Record<string, unknown>;
    expect(out.prose).toBeUndefined();
    expect((out.enforcement as { rules: { run?: string }[] }).rules[0]?.run).toBeUndefined();
  });

  it('mints each coordinate via the canonical decisionResourceUri helper', () => {
    const idx = buildIndex([D({ id: 'D-001', specId: '002-x', paths: ['src/**'] })], PROJECT, NOW);
    expect(idx.decisions[0]?.coordinate).toBe('spectastic://acme/payments/decision/002-x/D-001');
  });

  it('sorts by (specId, id)', () => {
    const idx = buildIndex(
      [
        D({ id: 'D-002', specId: '003-b', paths: ['src/**'] }),
        D({ id: 'D-001', specId: '002-a', paths: ['src/**'] }),
        D({ id: 'D-001', specId: '003-b', paths: ['src/**'] }),
      ],
      PROJECT,
      NOW,
    );
    expect(idx.decisions.map((d) => `${d.specId}/${d.id}`)).toEqual(['002-a/D-001', '003-b/D-001', '003-b/D-002']);
  });

  it('carries the project identity, schema, generatedAt, and a matching hash', () => {
    const idx = buildIndex([D({ id: 'D-001', specId: '002-x', paths: ['src/**'] })], PROJECT, NOW);
    expect(idx.schema).toBe('spectastic-decision-index/1');
    expect(idx.project).toBe(PROJECT);
    expect(idx.generatedAt).toBe(NOW.toISOString());
    expect(idx.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic — two builds of the same input are byte-identical', () => {
    const decisions = [D({ id: 'D-001', specId: '002-x', paths: ['src/**'] })];
    const a = buildIndex(decisions, PROJECT, NOW);
    const b = buildIndex(decisions, PROJECT, NOW);
    expect(a).toEqual(b);
  });

  it('refuses when the project is not owner-qualified', () => {
    expect(() => buildIndex([D({ id: 'D-001', specId: '002-x', paths: ['src/**'] })], 'payments', NOW)).toThrow();
  });
});

function textOf(idx: ReturnType<typeof buildIndex>): string {
  return JSON.stringify(idx);
}

describe('validateIndex', () => {
  function valid(): ReturnType<typeof buildIndex> {
    return buildIndex([D({ id: 'D-001', specId: '002-x', paths: ['src/**'] })], PROJECT, NOW);
  }

  it('accepts a well-formed index matching the expected project', () => {
    const r = validateIndex(textOf(valid()), PROJECT);
    expect(r.ok).toBe(true);
  });

  it('rejects an unknown schema', () => {
    const idx = { ...valid(), schema: 'something-else/1' };
    expect(validateIndex(JSON.stringify(idx), PROJECT).ok).toBe(false);
  });

  it('rejects a bare project', () => {
    const idx = { ...valid(), project: 'payments' };
    expect(validateIndex(JSON.stringify(idx), 'payments').ok).toBe(false);
  });

  it('rejects a project that disagrees with the expected one (FR-005)', () => {
    const r = validateIndex(textOf(valid()), 'other/project');
    expect(r.ok).toBe(false);
  });

  it('rejects a missing content hash', () => {
    const idx = { ...valid() } as Record<string, unknown>;
    delete idx.contentHash;
    expect(validateIndex(JSON.stringify(idx), PROJECT).ok).toBe(false);
  });

  it('rejects a content hash that disagrees with the decisions', () => {
    const idx = { ...valid(), contentHash: 'sha256:' + '0'.repeat(64) };
    expect(validateIndex(JSON.stringify(idx), PROJECT).ok).toBe(false);
  });

  it('rejects a decision that is not accepted', () => {
    const idx = valid();
    (idx.decisions[0] as { status: string }).status = 'proposed';
    expect(validateIndex(JSON.stringify(idx), PROJECT).ok).toBe(false);
  });

  it('rejects a decision missing an id, specId, or coordinate', () => {
    for (const key of ['id', 'specId', 'coordinate'] as const) {
      const idx = valid();
      delete (idx.decisions[0] as Record<string, unknown>)[key];
      expect(validateIndex(JSON.stringify(idx), PROJECT).ok, key).toBe(false);
    }
  });

  it('rejects a decision whose coordinate disagrees with its ids', () => {
    const idx = valid();
    (idx.decisions[0] as { coordinate: string }).coordinate = 'spectastic://acme/payments/decision/wrong/D-999';
    expect(validateIndex(JSON.stringify(idx), PROJECT).ok).toBe(false);
  });

  it('rejects a resource whose owner is not the index\'s own project', () => {
    const idx = buildIndex(
      [D({ id: 'D-001', specId: '002-x', resource: { coordinate: 'spectastic://other/x/datastore/y', owner: 'other/x' } })],
      PROJECT,
      NOW,
    );
    expect(validateIndex(textOf(idx), PROJECT).ok).toBe(false);
  });

  it('rejects malformed JSON', () => {
    expect(validateIndex('{ not json', PROJECT).ok).toBe(false);
  });

  it('names a reason on every rejection', () => {
    const r = validateIndex('{ not json', PROJECT);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });
});
