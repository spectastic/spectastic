import { describe, expect, it } from 'vitest';
import { criterionThresholdJustifiedRule } from '../src/rules/criterion-threshold-justified.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `criterion-threshold-justified` (108-success-criteria, T-105, FR-011).
 *
 * 37% of the estate asserts a bare zero. Some are right — one corrupted
 * byte is a defect — and the rest are a reflex that makes a criterion
 * unfalsifiable by construction, since the first occurrence fails it. The
 * justification is what separates the two.
 */

function check(html: string, extraAttrs = ''): Finding[] {
  const doc: ParsedDocument = parse(html, 'specs/999-x/spec.html');
  return criterionThresholdJustifiedRule.check({ doc });
}

const wrap = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;
const criterion = (p: string, attrs = '') =>
  wrap(`<spec-criterion id="SC-001" actor="reviewer" validates="FR-001" ${attrs}><p>${p}</p></spec-criterion>`);

describe('an ordinary, non-extreme threshold', () => {
  it('needs no justification', () => {
    const f = check(criterion('Adoption rate ≥ 60% (target 85%), from 20% today.'));
    expect(f).toEqual([]);
  });
});

describe('a zero, hundred-percent or equal threshold', () => {
  it('is reported when the target is 0% and no justification is given', () => {
    const f = check(criterion('Failure rate ≤ 5% (target 0%), from 12% today.'));
    expect(f).toHaveLength(1);
  });

  it('is reported when both threshold and target are 100%', () => {
    const f = check(criterion('Coverage 100% (target 100%), from 0% today.'));
    expect(f).toHaveLength(1);
  });

  it('is reported when the threshold and target are the bare-zero equal case', () => {
    const f = check(criterion('Regressions 0 (target 0), from 3 last quarter.'));
    expect(f).toHaveLength(1);
  });

  it('is silent once a justification= is present', () => {
    const f = check(criterion('Regressions 0 (target 0), from 3 last quarter.', 'justification="one corrupted byte is a defect"'));
    expect(f).toEqual([]);
  });
});
