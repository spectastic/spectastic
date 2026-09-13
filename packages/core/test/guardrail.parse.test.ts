import { describe, expect, it } from 'vitest';
import { parseDecisions } from '../src/guardrail/parse.js';
import { adrsCommand } from '../src/commands/adrs.js';
import { buildRetrievalLog, renderRetrievalLog } from '../src/guardrail/log.js';
import { decisionsForPaths } from '../src/guardrail/retrieve.js';

/**
 * Slice 2 parse + log (spec 112). Parses the extended <spec-decision> record out
 * of a design.html and threads it through retrieval + the reproducible log.
 */

const DESIGN = `<!doctype html><html><body><main>
<spec-decision id="D-007" status="accepted" posture="block" supersedes="D-003">
  <spec-scope>
    <spec-path>src/**/persistence/**</spec-path>
    <spec-module>**.hex.core..</spec-module>
  </spec-scope>
  <spec-enforcement>
    <spec-rule tool="archunit" id="only_persistence_touches_dao" run="./gradlew test"></spec-rule>
  </spec-enforcement>
  <spec-reason>Every position change must emit PositionChanged.</spec-reason>
  <h4>D-007</h4>
</spec-decision>
<spec-decision id="D-008" status="accepted" posture="block">
  <spec-scope><spec-path>db/grants/**</spec-path></spec-scope>
  <spec-enforcement><spec-none reason="operational DB grant; no static check"></spec-none></spec-enforcement>
  <spec-reason>Least privilege at the DB.</spec-reason>
  <h4>D-008</h4>
</spec-decision>
<spec-decision id="D-009"><h4>legacy, no metadata</h4></spec-decision>
</main></body></html>`;

describe('parseDecisions', () => {
  const decisions = parseDecisions(DESIGN, '002-downstream');

  it('parses all decisions including a legacy metadata-free one', () => {
    expect(decisions.map((d) => d.id).sort()).toEqual(['D-007', 'D-008', 'D-009']);
  });
  it('extracts status, posture, scope paths, modules, supersedes and reason', () => {
    const d = decisions.find((x) => x.id === 'D-007')!;
    expect(d.status).toBe('accepted');
    expect(d.posture).toBe('block');
    expect(d.paths).toEqual(['src/**/persistence/**']);
    expect(d.modules).toEqual(['**.hex.core..']);
    expect(d.supersedes).toBe('D-003');
    expect(d.reason).toMatch(/PositionChanged/);
    expect(d.enforcement?.rules[0]).toEqual({ tool: 'archunit', id: 'only_persistence_touches_dao', run: './gradlew test' });
  });
  it('parses a none-with-reason enforcement', () => {
    const d = decisions.find((x) => x.id === 'D-008')!;
    expect(d.enforcement?.none?.reason).toMatch(/DB grant/);
    expect(d.enforcement?.rules).toEqual([]);
  });
  it('leaves a legacy decision with no governance metadata (backward compatible)', () => {
    const d = decisions.find((x) => x.id === 'D-009')!;
    expect(d.status).toBeUndefined();
    expect(d.paths).toEqual([]);
    expect(d.enforcement).toBeUndefined();
  });
});

describe('adrsCommand end-to-end (in-memory decisions)', () => {
  const decisions = parseDecisions(DESIGN, '002-downstream');
  const NOW = new Date('2026-09-13T10:00:00.000Z');

  it('retrieves governing decisions and writes a deterministic log', async () => {
    const ctx = { cwd: '/nonexistent' };
    const a = await adrsCommand({ paths: ['src/x/persistence/Repo.java'], project: 'acme/pk', now: NOW, decisions }, ctx);
    expect(a.matches.map((m) => m.decision.id)).toEqual(['D-007']);
    expect(a.log.governing[0]?.coordinate).toBe('spectastic://acme/pk/decision/002-downstream/D-007');
    // Identical inputs → byte-identical log (rubric item 2 determinism).
    const b = await adrsCommand({ paths: ['src/x/persistence/Repo.java'], project: 'acme/pk', now: NOW, decisions }, ctx);
    expect(a.logText).toBe(b.logText);
  });

  it('the log is a stable projection of retrieval', () => {
    const matches = decisionsForPaths(['db/grants/x.sql'], decisions);
    const log = buildRetrievalLog('acme/pk', ['db/grants/x.sql'], matches, NOW);
    expect(renderRetrievalLog(log)).toContain('002-downstream/D-008');
    expect(log.at).toBe('2026-09-13T10:00:00.000Z');
  });
});
