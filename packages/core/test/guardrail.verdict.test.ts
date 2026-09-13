import { describe, expect, it } from 'vitest';
import { hasViolation, readSarif, verdictFor } from '../src/guardrail/verdict.js';
import { renderVerdict } from '../src/guardrail/verdict-log.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * Slice 3b verdict (spec 115, FR-001..FR-007, SC-001/SC-002/SC-004). Tests-first.
 */

const NOW = new Date('2026-09-13T00:00:00.000Z');

const D = (o: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  ...o,
});

// A content-rule decision: no `UPDATE positions` outside the persistence adapter.
const CONTENT_DECISION = D({
  id: 'D-007',
  specId: '002-downstream',
  status: 'accepted',
  paths: ['src/**/persistence/**'],
  reason: 'Every position change must emit PositionChanged so the audit hooks fire.',
  enforcement: { rules: [{ tool: 'native-content', id: 'no_direct_positions_write', pattern: 'UPDATE\\s+positions' }] },
});

const files: Record<string, string> = {
  'src/recon/Job.java': 'void run() {\n  db.exec("UPDATE positions SET qty=0");\n}',
  'src/app/persistence/Repo.java': 'void save() {\n  db.exec("UPDATE positions SET qty=?");\n}',
};
const readFile = (p: string) => files[p] ?? null;

describe('verdictFor — native content detector', () => {
  it('flags a forbidden pattern in a changed file OUTSIDE the allowed zone (SC-001)', () => {
    const v = verdictFor({ changed: ['src/recon/Job.java'], decisions: [CONTENT_DECISION], now: NOW, readFile });
    expect(v.violations.length).toBe(1);
    const hit = v.violations[0]!;
    expect(hit.decisionId).toBe('D-007');
    expect(hit.ruleId).toBe('no_direct_positions_write');
    expect(hit.file).toBe('src/recon/Job.java');
    expect(hit.line).toBe(2);
    expect(hit.reason).toMatch(/PositionChanged/);
    expect(hasViolation(v)).toBe(true);
  });

  it('does NOT flag the same pattern inside the allowed zone (the adapter may)', () => {
    const v = verdictFor({ changed: ['src/app/persistence/Repo.java'], decisions: [CONTENT_DECISION], now: NOW, readFile });
    expect(v.violations).toEqual([]);
    expect(hasViolation(v)).toBe(false);
  });

  it('ignores a proposed decision (only accepted judge)', () => {
    const proposed = D({ ...CONTENT_DECISION, status: 'proposed' });
    expect(verdictFor({ changed: ['src/recon/Job.java'], decisions: [proposed], now: NOW, readFile }).violations).toEqual([]);
  });
});

describe('verdictFor — native path detector (SC-004)', () => {
  const pathDecision = D({
    id: 'D-009',
    specId: '003-legacy',
    status: 'accepted',
    paths: ['src/**'],
    reason: 'No new code under the frozen legacy tree.',
    enforcement: { rules: [{ tool: 'native-path', id: 'no_legacy_writes', deny: 'src/legacy/**' }] },
  });
  it('flags a changed file matching the deny glob', () => {
    const v = verdictFor({ changed: ['src/legacy/Old.java', 'src/ok/New.java'], decisions: [pathDecision], now: NOW, readFile: () => null });
    expect(v.violations.map((x) => x.file)).toEqual(['src/legacy/Old.java']);
    expect(v.violations[0]?.detector).toBe('path');
  });
  it('is deterministic under a pinned clock', () => {
    const args = { changed: ['src/legacy/Old.java'], decisions: [pathDecision], now: NOW, readFile: () => null };
    expect(verdictFor(args)).toEqual(verdictFor(args));
  });
});

describe('readSarif + verdictFor — enforcer ingestion (SC-002)', () => {
  const archDecision = D({
    id: 'D-001',
    specId: '004-arch',
    status: 'accepted',
    paths: ['src/**'],
    reason: 'Only the persistence adapter touches data-access APIs.',
    enforcement: { rules: [{ tool: 'archunit', id: 'only_persistence_touches_dao' }] },
  });
  const sarif = {
    runs: [
      {
        results: [
          { ruleId: 'only_persistence_touches_dao', locations: [{ physicalLocation: { artifactLocation: { uri: 'src/recon/Job.java' }, region: { startLine: 42 } } }] },
          { ruleId: 'some_other_rule', locations: [] },
        ],
      },
    ],
  };

  it('readSarif extracts {ruleId, uri, line}', () => {
    expect(readSarif(sarif)).toEqual([
      { ruleId: 'only_persistence_touches_dao', uri: 'src/recon/Job.java', line: 42 },
      { ruleId: 'some_other_rule' },
    ]);
  });

  it('composes the decision reason for a matched rule-id; ignores an unmatched one', () => {
    const v = verdictFor({ changed: [], decisions: [archDecision], now: NOW, readFile: () => null, sarif });
    expect(v.violations.length).toBe(1);
    expect(v.violations[0]?.decisionId).toBe('D-001');
    expect(v.violations[0]?.reason).toMatch(/persistence adapter/);
    expect(v.violations[0]?.line).toBe(42);
    expect(v.violations[0]?.detector).toBe('enforcer');
  });
});

describe('verdict persistence (FR-006)', () => {
  it('renders a deterministic, reconstructable JSON artifact', () => {
    const v = verdictFor({ changed: ['src/recon/Job.java'], decisions: [CONTENT_DECISION], now: NOW, readFile });
    const a = renderVerdict(v);
    expect(a).toBe(renderVerdict(v));
    expect(JSON.parse(a).violations[0].ruleId).toBe('no_direct_positions_write');
    expect(JSON.parse(a).at).toBe('2026-09-13T00:00:00.000Z');
  });
});

describe('verdict scope honesty — repo-local (TBD-verdict-scope-honesty)', () => {
  it('the artifact declares repo-local scope and how many decisions it evaluated', () => {
    const v = verdictFor({ changed: ['src/recon/Job.java'], decisions: [CONTENT_DECISION], now: NOW, readFile });
    expect(v.scope).toBe('repo-local');
    expect(v.decisionsEvaluated).toBe(1);
    // the claim survives serialisation — a reader offline sees what was NOT evaluated
    const artifact = JSON.parse(renderVerdict(v));
    expect(artifact.scope).toBe('repo-local');
    expect(artifact.decisionsEvaluated).toBe(1);
  });

  it('counts only ACCEPTED decisions — a proposed decision is not evaluated, and says so', () => {
    const proposed = D({ ...CONTENT_DECISION, id: 'D-999', status: 'proposed' });
    const v = verdictFor({ changed: [], decisions: [CONTENT_DECISION, proposed], now: NOW, readFile: () => null });
    expect(v.decisionsEvaluated).toBe(1); // the proposed one is excluded, so the count never overstates coverage
  });
});
