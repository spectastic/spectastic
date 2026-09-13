import { describe, expect, it } from 'vitest';
import { decisionResourceUri, parseResourceUri, RESOURCE_KINDS } from '../src/project-shared.js';

/**
 * The `decision` resource kind + coordinate (spec 112-guardrail-decision-record,
 * FR-004, SC-002). A decision is project-scoped (authority = project, not a
 * marketplace) and its name spans two segments, `<spec-id>/<D-NNN>`, mirroring
 * the `screen` coordinate. Written before the kind exists (test-first).
 */

const CASES = [
  { project: 'acme', specId: '002-downstream', decisionId: 'D-007' },
  { project: 'spectastic/spectastic', specId: '112-guardrail-decision-record', decisionId: 'D-002' },
  { project: 'acme-corp/position-keeper', specId: '001-position-core', decisionId: 'D-101' },
];

describe('decision resource kind', () => {
  it('is a recognised resource kind', () => {
    expect(RESOURCE_KINDS).toContain('decision');
  });

  it('composes and round-trips back to the same coordinate for each case', () => {
    for (const c of CASES) {
      const uri = decisionResourceUri(c.project, c.specId, c.decisionId);
      const parsed = parseResourceUri(uri);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.kind).toBe('decision');
      expect(parsed.value.project).toBe(c.project);
      expect(parsed.value.name).toBe(`${c.specId}/${c.decisionId}`);
    }
  });

  it('composes deterministically (same inputs → same coordinate)', () => {
    const a = decisionResourceUri('acme', '002-downstream', 'D-007');
    const b = decisionResourceUri('acme', '002-downstream', 'D-007');
    expect(a).toBe(b);
    expect(a).toBe('spectastic://acme/decision/002-downstream/D-007');
  });
});
