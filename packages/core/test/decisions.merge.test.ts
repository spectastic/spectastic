import { describe, expect, it } from 'vitest';
import { MAX_FOREIGN_PATTERN_LENGTH, mergeForeignDecisions } from '../src/decisions/merge.js';
import type { IndexedDecision } from '../src/decisions/index.js';

/**
 * `mergeForeignDecisions` reconstitutes one source's validated index into
 * `GovernanceDecision`s the verdict can evaluate directly (spec
 * 122-decision-index-federation, D-006, FR-006/FR-009). Only resource-scoped
 * decisions participate — a foreign path/module glob means nothing in the
 * consumer's tree — and every rule's pattern is length-capped and
 * compile-checked here, before the kernel's one `RegExp` site.
 */

const RESOURCE_SCOPED: IndexedDecision = {
  coordinate: 'spectastic://acme/payments/decision/002-ledger/D-003',
  id: 'D-003',
  specId: '002-ledger',
  status: 'accepted',
  posture: 'block',
  paths: [],
  modules: [],
  resource: {
    coordinate: 'spectastic://acme/payments/datastore/ledger',
    owner: 'acme/payments',
    allowedIn: 'src/**/persistence/**',
  },
  reason: 'Every ledger write must emit LedgerPosted.',
  title: 'D-003 — only payments writes the ledger',
  enforcement: { rules: [{ tool: 'native-content', id: 'no_ledger_write', pattern: 'UPDATE\\s+ledger' }] },
};

const PATH_ONLY: IndexedDecision = {
  coordinate: 'spectastic://acme/payments/decision/002-ledger/D-004',
  id: 'D-004',
  specId: '002-ledger',
  status: 'accepted',
  paths: ['src/**/api/**'],
  modules: [],
  reason: 'API handlers never touch storage.',
};

describe('mergeForeignDecisions — resource-only filter', () => {
  it('keeps a resource-scoped decision and counts it evaluated', () => {
    const r = mergeForeignDecisions([RESOURCE_SCOPED]);
    expect(r.decisions).toHaveLength(1);
    expect(r.decisions[0]?.id).toBe('D-003');
    expect(r.decisions[0]?.resource?.owner).toBe('acme/payments');
    expect(r.evaluated).toBe(1);
    expect(r.ignored).toBe(0);
    expect(r.refused).toBe(0);
  });

  it('drops a path/module-only decision and counts it ignored, not evaluated', () => {
    const r = mergeForeignDecisions([PATH_ONLY]);
    expect(r.decisions).toHaveLength(0);
    expect(r.evaluated).toBe(0);
    expect(r.ignored).toBe(1);
    expect(r.refused).toBe(0);
  });

  it('a mixed source counts each decision independently', () => {
    const r = mergeForeignDecisions([RESOURCE_SCOPED, PATH_ONLY]);
    expect(r.decisions.map((d) => d.id)).toEqual(['D-003']);
    expect(r.evaluated).toBe(1);
    expect(r.ignored).toBe(1);
  });
});

describe('mergeForeignDecisions — the merged decision carries what verdictFor needs', () => {
  it('keeps id, specId, status, paths, modules, resource, reason, title', () => {
    const d = mergeForeignDecisions([RESOURCE_SCOPED]).decisions[0];
    expect(d).toMatchObject({
      id: 'D-003',
      specId: '002-ledger',
      status: 'accepted',
      posture: 'block',
      paths: [],
      modules: [],
      reason: 'Every ledger write must emit LedgerPosted.',
      title: 'D-003 — only payments writes the ledger',
    });
  });

  it('keeps a passing rule (tool, id, pattern, no run)', () => {
    const d = mergeForeignDecisions([RESOURCE_SCOPED]).decisions[0];
    expect(d?.enforcement?.rules).toEqual([{ tool: 'native-content', id: 'no_ledger_write', pattern: 'UPDATE\\s+ledger' }]);
  });
});

describe('mergeForeignDecisions — the FR-009 pattern gate (cap + compile), before the kernel compile site', () => {
  const withPattern = (pattern: string): IndexedDecision => ({
    ...RESOURCE_SCOPED,
    enforcement: { rules: [{ tool: 'native-content', id: 'x', pattern }] },
  });

  it('a pattern at exactly the cap is kept', () => {
    const pattern = 'a'.repeat(MAX_FOREIGN_PATTERN_LENGTH);
    const r = mergeForeignDecisions([withPattern(pattern)]);
    expect(r.decisions[0]?.enforcement?.rules).toHaveLength(1);
    expect(r.refused).toBe(0);
  });

  it('a pattern one character over the cap is refused, counted, and never reaches the merged decision', () => {
    const pattern = 'a'.repeat(MAX_FOREIGN_PATTERN_LENGTH + 1);
    const r = mergeForeignDecisions([withPattern(pattern)]);
    expect(r.decisions[0]?.enforcement?.rules).toEqual([]);
    expect(r.refused).toBe(1);
    // Still evaluated — the decision itself is resource-scoped and kept; only
    // the offending rule is dropped.
    expect(r.evaluated).toBe(1);
  });

  it('a pattern that fails to compile is refused and counted, never run', () => {
    const r = mergeForeignDecisions([withPattern('(unclosed[')]);
    expect(r.decisions[0]?.enforcement?.rules).toEqual([]);
    expect(r.refused).toBe(1);
  });

  it('one refused rule alongside one passing rule: only the bad one is dropped', () => {
    const decision: IndexedDecision = {
      ...RESOURCE_SCOPED,
      enforcement: {
        rules: [
          { tool: 'native-content', id: 'good', pattern: 'UPDATE\\s+ledger' },
          { tool: 'native-content', id: 'bad', pattern: '(unclosed[' },
        ],
      },
    };
    const r = mergeForeignDecisions([decision]);
    expect(r.decisions[0]?.enforcement?.rules).toEqual([{ tool: 'native-content', id: 'good', pattern: 'UPDATE\\s+ledger' }]);
    expect(r.refused).toBe(1);
  });

  it('a deny-only rule (no pattern) is never subject to the pattern gate', () => {
    const decision: IndexedDecision = {
      ...RESOURCE_SCOPED,
      enforcement: { rules: [{ tool: 'native-path', id: 'no-direct', deny: 'src/**/db/**' }] },
    };
    const r = mergeForeignDecisions([decision]);
    expect(r.decisions[0]?.enforcement?.rules).toEqual([{ tool: 'native-path', id: 'no-direct', deny: 'src/**/db/**' }]);
    expect(r.refused).toBe(0);
  });
});

describe('mergeForeignDecisions — empty input', () => {
  it('returns zero counts and no decisions', () => {
    const r = mergeForeignDecisions([]);
    expect(r).toEqual({ decisions: [], evaluated: 0, ignored: 0, refused: 0 });
  });
});
