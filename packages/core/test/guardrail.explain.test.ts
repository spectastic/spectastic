import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { explainViolations, renderExplanations } from '../src/guardrail/explain.js';
import type { GovernanceDecision, Verdict } from '../src/guardrail/types.js';

/**
 * Slice: reviewer-grade explanation (spec 118, FR-001/FR-002/FR-005, SC-001/SC-003/SC-005). Tests-first.
 */

const decision: GovernanceDecision = {
  id: 'D-007',
  specId: '002-downstream-consumers',
  status: 'accepted',
  posture: 'block',
  paths: ['src/**/persistence/**'],
  modules: [],
  reason: 'Every position change must emit PositionChanged so the audit hooks fire.',
  title: 'D-007 · ADR-0007 — only the persistence adapter touches the data store',
  prose: 'Context. The emission guarantee is only as strong as the boundary. Decision. Only the adapter may write positions.',
  enforcement: {
    rules: [{ tool: 'semgrep', id: 'no_sql_write_to_positions_outside_adapter', pattern: 'UPDATE\\s+positions', allowedIn: 'src/**/persistence/**' }],
  },
};

const PRIYA = 'docs/priya-pr/Job.java';
const priyaSource = 'line1\nline2\n  db.exec("UPDATE positions SET quantity = 0");\nline4\nline5';
const verdict: Verdict = {
  at: '2026-09-13T00:00:00.000Z',
  scope: 'repo-local',
  decisionsEvaluated: 1,
  changed: [PRIYA],
  violations: [
    {
      decisionId: 'D-007',
      specId: '002-downstream-consumers',
      ruleId: 'no_sql_write_to_positions_outside_adapter',
      reason: decision.reason!,
      file: PRIYA,
      line: 3,
      detector: 'content',
      cause: 'path',
      source: PRIYA,
      target: 'UPDATE\\s+positions',
    },
  ],
};

const explain = (readFile: (p: string) => string | null) =>
  explainViolations({ verdict, decisions: [decision], project: 'acme/pk', readFile });

describe('explainViolations (SC-001)', () => {
  const e = explain((p) => (p === PRIYA ? priyaSource : null))[0]!;

  it('Offending — shows the code at the violation line, marked', () => {
    expect(e.offending).toMatch(/UPDATE positions/);
    expect(e.offending).toMatch(/>\s+3\|/); // the offending line is marked
  });
  it('Why — carries the decision reason, prose, coordinate, and file', () => {
    expect(e.decisionReason).toMatch(/PositionChanged/);
    expect(e.decisionProse).toMatch(/only the adapter may write positions/i);
    expect(e.decisionCoordinate).toBe('spectastic://acme/pk/decision/002-downstream-consumers/D-007');
    expect(e.decisionFile).toBe('specs/002-downstream-consumers/design.html#D-007');
    expect(e.decisionTitle).toMatch(/ADR-0007/);
  });
  it('Sanctioned path — names where the pattern is permitted (allowed-in)', () => {
    expect(e.sanctionedPath).toBe('src/**/persistence/**');
  });
  it('renders all three sections in the triage shape', () => {
    const out = renderExplanations([e]);
    expect(out).toMatch(/Offending/);
    expect(out).toMatch(/Why it is a violation/);
    expect(out).toMatch(/Sanctioned path/);
    expect(out).toMatch(/ADR-0007/);
  });
});

describe('ownership violation — routes to the owner, not the file’s own directory (spec 120, SC-002)', () => {
  const OWNER = 'briancorbin/position-keeper-guardrails';
  const STORE = 'spectastic://briancorbin/position-keeper-guardrails/datastore/positions';
  const ownVerdict: Verdict = {
    at: '2026-09-14T00:00:00.000Z',
    scope: 'repo-local',
    decisionsEvaluated: 1,
    changed: ['src/acme/recon/hex/persistence/PositionRepositoryAdapter.java'],
    violations: [
      {
        decisionId: 'D-007',
        specId: '002-downstream-consumers',
        ruleId: 'no_sql_write_to_positions_outside_adapter',
        reason: decision.reason!,
        file: 'src/acme/recon/hex/persistence/PositionRepositoryAdapter.java',
        line: 3,
        detector: 'content',
        cause: 'ownership',
        owner: OWNER,
        storeCoordinate: STORE,
        source: 'src/acme/recon/hex/persistence/PositionRepositoryAdapter.java',
        target: 'UPDATE\\s+positions',
      },
    ],
  };
  // Evaluated in the CONSUMER project — its copied decision projects to acme/…
  const out = renderExplanations(
    explainViolations({ verdict: ownVerdict, decisions: [decision], project: 'acme/reconciliation-service', readFile: () => null }),
  );

  it('names the store owner + coordinate and routes to that service', () => {
    expect(out).toMatch(new RegExp(`owned by ${OWNER.replace('/', '\\/')}`));
    expect(out).toMatch(/datastore\/positions/);
    expect(out).toMatch(/route the change through its owner/i);
  });
  it('omits the sanctioned-path misdirection and the consumer’s copied decision coordinate', () => {
    expect(out).not.toMatch(/Sanctioned path/);
    // the consumer's projection would be spectastic://acme/reconciliation-service/decision/...
    expect(out).not.toMatch(/acme\/reconciliation-service\/decision/);
  });
});

describe('unreadable file (FR-005 / SC-005)', () => {
  it('states the file is not on disk, but Why + Sanctioned path still render', () => {
    const e = explain(() => null)[0]!;
    expect(e.offending).toMatch(/not on disk/i);
    expect(e.decisionReason).toMatch(/PositionChanged/);
    expect(e.sanctionedPath).toBe('src/**/persistence/**');
  });
});

describe('determinism (SC-003)', () => {
  it('is byte-identical on repeated runs', () => {
    const a = renderExplanations(explain((p) => (p === PRIYA ? priyaSource : null)));
    const b = renderExplanations(explain((p) => (p === PRIYA ? priyaSource : null)));
    expect(a).toBe(b);
  });
});

describe('explain — no model, no network (NFR-001)', () => {
  const NET = /^(node:https?|node:net|undici|axios|got|openai|ollama|@anthropic-ai\/)|\/providers\/(claude|ollama)/;
  const SPEC = /(?:from\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
  const here = dirname(fileURLToPath(import.meta.url));
  function walk(entry: string, seen = new Set<string>()): string[] {
    const cands = [entry, `${entry}.ts`, `${entry}.js`];
    const p = cands.find((c) => existsSync(c) && c.endsWith('.ts')) ?? cands.find(existsSync);
    if (!p || seen.has(p)) return [];
    seen.add(p);
    const src = readFileSync(p, 'utf8');
    const out = [src];
    for (const m of src.matchAll(SPEC)) if (m[1]!.startsWith('.')) out.push(...walk(resolve(dirname(p), m[1]!.replace(/\.js$/, '')), seen));
    return out;
  }
  it('imports 0 network or model-client modules', () => {
    const sources = walk(resolve(here, '..', 'src', 'guardrail', 'explain.ts'));
    expect(sources.flatMap((s) => [...s.matchAll(SPEC)].map((m) => m[1]!)).filter((sp) => NET.test(sp))).toEqual([]);
  });
});
