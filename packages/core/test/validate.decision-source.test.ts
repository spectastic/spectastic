import { describe, expect, it } from 'vitest';
import { decisionSourceUndeclaredFinding, decisionSourceUnpinnedFinding } from '../src/commands/validate.js';
import { buildIndex } from '../src/decisions/index.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * `decision-source-unpinned` (spec 122-decision-index-federation, FR-008) and
 * `decision-source-undeclared` (FR-011). Clones `decisionIndexStaleFinding`'s
 * shape: pure functions the CLI's validate folds in, given the declared
 * source and what's actually on disk / in config as data.
 */

const NOW = new Date('2026-09-19T00:00:00.000Z');
const OWNER = 'acme/payments';
const FILE = '.spectastic/decisions/acme--payments.json';

const DECISION: GovernanceDecision = {
  id: 'D-003',
  specId: '002-ledger',
  status: 'accepted',
  paths: [],
  modules: [],
  resource: { coordinate: 'spectastic://acme/payments/datastore/ledger', owner: OWNER },
  reason: 'x',
};

function indexTextAndHash(): { text: string; hash: string } {
  const index = buildIndex([DECISION], OWNER, NOW);
  return { text: `${JSON.stringify(index, null, 2)}\n`, hash: index.contentHash };
}

describe('decisionSourceUnpinnedFinding', () => {
  it('errors when the declared source has no vendored copy on disk', () => {
    const f = decisionSourceUnpinnedFinding({ project: OWNER, pin: undefined }, null, FILE);
    expect(f?.rule).toBe('decision-source-unpinned');
    expect(f?.severity).toBe('error');
  });

  it('errors when the vendored copy fails validation', () => {
    const f = decisionSourceUnpinnedFinding({ project: OWNER, pin: undefined }, '{"schema":"bogus"}', FILE);
    expect(f?.rule).toBe('decision-source-unpinned');
  });

  it('errors when the vendored copy disagrees with its recorded pin', () => {
    const { text } = indexTextAndHash();
    const f = decisionSourceUnpinnedFinding(
      { project: OWNER, pin: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' },
      text,
      FILE,
    );
    expect(f?.rule).toBe('decision-source-unpinned');
  });

  it('is clean when the vendored copy matches its recorded pin', () => {
    const { text, hash } = indexTextAndHash();
    expect(decisionSourceUnpinnedFinding({ project: OWNER, pin: hash }, text, FILE)).toBeNull();
  });
});

describe('decisionSourceUndeclaredFinding', () => {
  it('warns when the source has no matching unit edge in consumes[]', () => {
    const f = decisionSourceUndeclaredFinding({ project: OWNER }, [], 'spectastic.json');
    expect(f?.rule).toBe('decision-source-undeclared');
    expect(f?.severity).toBe('warning');
  });

  it('is clean when a consumes[] unit edge names the same project', () => {
    const edges = [`spectastic://${OWNER}/unit/payments-lib`];
    expect(decisionSourceUndeclaredFinding({ project: OWNER }, edges, 'spectastic.json')).toBeNull();
  });

  it('warns when consumes[] has edges but none for this project', () => {
    const edges = ['spectastic://other/service/unit/other-lib'];
    const f = decisionSourceUndeclaredFinding({ project: OWNER }, edges, 'spectastic.json');
    expect(f?.rule).toBe('decision-source-undeclared');
  });

  it('is unaffected by a malformed consumes[] entry — never throws', () => {
    const edges = ['not-a-uri-at-all', `spectastic://${OWNER}/unit/payments-lib`];
    expect(decisionSourceUndeclaredFinding({ project: OWNER }, edges, 'spectastic.json')).toBeNull();
  });
});
