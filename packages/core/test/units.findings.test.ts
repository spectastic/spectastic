import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declaredEdgeFindings } from '../src/units/findings.js';

/**
 * The declared-edge validate scan (spec 080-unit-edge-authoring, US3).
 *
 * A folded CLI scan rather than a schema rule: the schema engine reads HTML
 * artifacts, and this reads `spectastic.json`. It follows `enforceWaiverFindings`
 * and the marketplace-identity scan, which exist for exactly the same reason.
 */

function project(body?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-units-findings-'));
  if (body !== undefined) writeFileSync(join(dir, 'spectastic.json'), body, 'utf8');
  return dir;
}

const SELF_NAME = 'spectastic://a/b/unit/root';

describe('US3 · malformed and self-referential edges are errors (080 T-300, FR-007)', () => {
  it('flags a malformed coordinate', () => {
    const dir = project('{"project":"a/b","name":"root","consumes":["not a coordinate"]}');
    const findings = declaredEdgeFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.file).toBe('spectastic.json');
    expect(findings[0]?.message).toContain('not a coordinate');
  });

  it('flags an edge naming its own declaring unit', () => {
    const dir = project(`{"project":"a/b","consumes":["${SELF_NAME}"]}`);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'root' }), 'utf8');
    const findings = declaredEdgeFindings(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toMatch(/itself|own/i);
  });

  it('names the offending coordinate, not an internal requirement id (P-10)', () => {
    const dir = project('{"project":"a/b","consumes":["  "]}');
    for (const f of declaredEdgeFindings(dir)) {
      expect(f.message).not.toMatch(/\bFR-\d|\bNFR-\d|\bT-\d{3}/);
    }
  });
});

describe('US3 · a well-formed but absent target is NOT a finding (080 T-301, FR-008/SC-003)', () => {
  it('stays silent on a coordinate naming a project that is not checked out', () => {
    // The federated common case: most consumers do not have their providers on
    // disk. Erroring here would make the ordinary case unvalidatable, and 079
    // already reports it honestly as unverified.
    const dir = project('{"project":"a/b","consumes":["spectastic://acme/nowhere/unit/@acme/x"]}');
    expect(declaredEdgeFindings(dir)).toEqual([]);
  });

  it('stays silent on a contract coordinate, which 076 put in this same key', () => {
    const dir = project('{"project":"a/b","consumes":["spectastic://acme/pay/contract/orders-api"]}');
    expect(declaredEdgeFindings(dir)).toEqual([]);
  });
});

describe('US3 · degradation', () => {
  it('a project with no config yields no findings', () => {
    expect(declaredEdgeFindings(project())).toEqual([]);
  });

  it('a project with no consumes key yields no findings', () => {
    expect(declaredEdgeFindings(project('{"project":"a/b"}'))).toEqual([]);
  });

  it('an unparseable config yields no findings here — the config reader owns that error', () => {
    // Not this scan's job to report malformed JSON: reporting it twice from two
    // scans would double-count one defect.
    expect(() => declaredEdgeFindings(project('{ broken'))).not.toThrow();
    expect(declaredEdgeFindings(project('{ broken'))).toEqual([]);
  });
});
