import { describe, expect, it } from 'vitest';
import type { GovernanceDecision } from '../src/guardrail/types.js';
import { verdictFor } from '../src/guardrail/verdict.js';
import { renderVerdict } from '../src/guardrail/verdict-log.js';

/**
 * Tool-aware rule-id join (inbox I-091, 115 design D-007). Semgrep prefixes a
 * local rule's id with the rules file's directory path, separators → dots —
 * documented at docs.semgrep.dev/running-rules ("Semgrep adds custom prefixes
 * to IDs of local rules … replace the directory separators of the relative
 * path with dots") — so `id: X` in `enforcement/rules.yaml` comes out of
 * `--sarif` as `enforcement.X`. An exact join never matched it, and nothing
 * said so: a project whose only enforcement is Semgrep saw the verdict pass on
 * a SARIF full of findings.
 */

const NOW = new Date('2026-09-13T00:00:00.000Z');
const D = (o: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  ...o,
});

const semgrepDecision = D({
  id: 'D-007',
  specId: '002-downstream',
  status: 'accepted',
  paths: ['src/**/persistence/**'],
  reason: 'Every position change must emit PositionChanged.',
  enforcement: { rules: [{ tool: 'semgrep', id: 'no_sql_write_to_positions_outside_adapter' }] },
});

/** The shape Semgrep OSS emits for a rule declared in enforcement/semgrep-positions.yaml. */
const sarifFrom = (ruleIds: string[]) => ({
  version: '2.1.0',
  runs: [
    {
      tool: { driver: { name: 'Semgrep OSS' } },
      results: ruleIds.map((ruleId) => ({
        ruleId,
        locations: [{ physicalLocation: { artifactLocation: { uri: 'src/recon/Job.java' }, region: { startLine: 42 } } }],
      })),
    },
  ],
});

describe('enforcer rule-id join — tool-aware', () => {
  it("joins Semgrep's path-prefixed id to the declared bare id", () => {
    const v = verdictFor({
      changed: [],
      decisions: [semgrepDecision],
      now: NOW,
      readFile: () => null,
      sarif: sarifFrom(['enforcement.no_sql_write_to_positions_outside_adapter']),
    });
    expect(v.violations.map((x) => x.ruleId)).toEqual(['enforcement.no_sql_write_to_positions_outside_adapter']);
    expect(v.violations[0]?.decisionId).toBe('D-007');
    expect(v.enforcerResultsUnmatched).toBe(0);
  });

  it('still joins an exact id (a registry-sourced or unprefixed rule)', () => {
    const v = verdictFor({
      changed: [],
      decisions: [semgrepDecision],
      now: NOW,
      readFile: () => null,
      sarif: sarifFrom(['no_sql_write_to_positions_outside_adapter']),
    });
    expect(v.violations.length).toBe(1);
  });

  it('the suffix match needs the dot boundary — a longer id that merely ends the same way does not join', () => {
    const v = verdictFor({
      changed: [],
      decisions: [semgrepDecision],
      now: NOW,
      readFile: () => null,
      sarif: sarifFrom(['xno_sql_write_to_positions_outside_adapter']),
    });
    expect(v.violations.length).toBe(0);
    expect(v.enforcerResultsUnmatched).toBe(1);
  });

  it('a tool that does not namespace gets the exact join only', () => {
    const archunit = D({
      ...semgrepDecision,
      enforcement: { rules: [{ tool: 'archunit', id: 'only_persistence_touches_dao' }] },
    });
    const v = verdictFor({
      changed: [],
      decisions: [archunit],
      now: NOW,
      readFile: () => null,
      sarif: sarifFrom(['some.prefix.only_persistence_touches_dao']),
    });
    expect(v.violations.length).toBe(0);
    expect(v.enforcerResultsUnmatched).toBe(1);
  });

  it('counts every result no decision governs, so a silent miss is visible', () => {
    const v = verdictFor({
      changed: [],
      decisions: [semgrepDecision],
      now: NOW,
      readFile: () => null,
      sarif: sarifFrom(['enforcement.no_sql_write_to_positions_outside_adapter', 'enforcement.unrelated_a', 'unrelated_b']),
    });
    expect(v.violations.length).toBe(1);
    expect(v.enforcerResultsUnmatched).toBe(2);
    expect(JSON.parse(renderVerdict(v)).enforcerResultsUnmatched).toBe(2);
  });

  it('carries no unmatched count when no enforcer output was ingested', () => {
    const v = verdictFor({ changed: [], decisions: [semgrepDecision], now: NOW, readFile: () => null });
    expect(v.enforcerResultsUnmatched).toBeUndefined();
    expect('enforcerResultsUnmatched' in JSON.parse(renderVerdict(v))).toBe(false);
  });
});
