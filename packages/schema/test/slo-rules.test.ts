import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';
import { GOLDEN_SIGNALS } from '../src/slo-shared.js';

/**
 * Unit tests for the two SLO shape rules (spec 047-slo-nfr-artifact, FR-002).
 * Written before the rules exist (T-100/T-101) — failing until T-110/T-111/T-112
 * land, per the plan's D-005 test-first discipline.
 */

const TARGET_RULE = 'slo-target-required';
const WELL_FORMED_RULE = 'slo-well-formed';
const FIXTURES = join(__dirname, '..', 'fixtures');

function findingsFor(rule: string, dir: string, file: string) {
  const path = join(FIXTURES, dir, file);
  const html = readFileSync(path, 'utf8');
  return validate(html, path).filter((f) => f.rule === rule);
}

describe('slo-target-required', () => {
  it('flags a <spec-slo> missing target=', () => {
    const findings = findingsFor(TARGET_RULE, 'slo-target-required', 'positive.html');
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toMatch(/target=/);
  });

  it('does not flag a <spec-slo> with target=', () => {
    expect(findingsFor(TARGET_RULE, 'slo-target-required', 'negative.html')).toEqual([]);
  });
});

describe('slo-well-formed', () => {
  const findings = findingsFor(WELL_FORMED_RULE, 'slo-well-formed', 'positive.html');
  const messages = findings.map((f) => f.message).join('\n');

  it('flags a target= that resolves to no NFR in the document', () => {
    expect(messages).toMatch(/NFR-999/);
  });
  it('flags a missing objective=', () => {
    expect(messages).toMatch(/objective/i);
  });
  it('flags a missing window=', () => {
    expect(messages).toMatch(/window/i);
  });
  it('flags a missing budgeting=', () => {
    expect(messages).toMatch(/budgeting/i);
  });
  it('flags empty SLI content', () => {
    expect(messages).toMatch(/SLI|content|empty/i);
  });
  it('flags an unknown signal= value', () => {
    expect(messages).toMatch(/signal|throughput/i);
  });
  it('the unknown-signal fixHint teaches the availability→errors / throughput→traffic mapping (047 T-1001)', () => {
    const signalFinding = findings.find((f) => /signal/i.test(f.message));
    expect(signalFinding?.fixHint).toMatch(/availability .*errors/i);
    expect(signalFinding?.fixHint).toMatch(/throughput .*traffic/i);
  });
  it('every finding is error severity', () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });
  it('flags exactly six violations — one per <spec-slo> in the fixture', () => {
    expect(findings.length).toBe(6);
  });

  it('a fully well-formed <spec-slo> is clean', () => {
    expect(findingsFor(WELL_FORMED_RULE, 'slo-well-formed', 'negative.html')).toEqual([]);
  });
});

/**
 * Drift guard (047 T-1003): the golden-signal set is documented in three places —
 * the code constant GOLDEN_SIGNALS, spec 047's FR-002 requirement body, and its
 * §4 data-model "Golden signal" entry. This pins the two spec copies to the
 * constant so they can't silently diverge (mirrors profiles.test.ts's cross-tier
 * drift guard). If GOLDEN_SIGNALS ever changes, the spec prose must change with it
 * — this test fails until it does.
 */
describe('golden-signal vocabulary: spec ↔ code drift guard (047 T-1003)', () => {
  const specHtml = readFileSync(
    join(__dirname, '..', '..', '..', 'specs', '047-slo-nfr-artifact', 'spec.html'),
    'utf8',
  );

  function sectionText(id: string): string {
    const m = new RegExp(String.raw`<spec-requirement[^>]*\bid="${id}"[\s\S]*?</spec-requirement>`, 'i').exec(specHtml);
    return m?.[0] ?? '';
  }

  it('FR-002 enumerates exactly the GOLDEN_SIGNALS values', () => {
    const fr002 = sectionText('FR-002');
    expect(fr002, 'FR-002 not found in spec.html').not.toBe('');
    for (const sig of GOLDEN_SIGNALS) {
      expect(fr002, `FR-002 is missing golden signal "${sig}"`).toContain(`<code>${sig}</code>`);
    }
  });

  it('the §4 data-model "Golden signal" entry lists exactly the GOLDEN_SIGNALS values', () => {
    const entry = /<dt>Golden signal<\/dt><dd>([\s\S]*?)<\/dd>/i.exec(specHtml)?.[1] ?? '';
    expect(entry, '§4 Golden signal entry not found').not.toBe('');
    for (const sig of GOLDEN_SIGNALS) {
      expect(entry, `§4 data model is missing golden signal "${sig}"`).toContain(`<code>${sig}</code>`);
    }
  });
});
