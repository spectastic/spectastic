import { describe, expect, it } from 'vitest';
import { criterionObservableRule } from '../src/rules/criterion-observable.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `criterion-observable` (108-success-criteria, T-101, FR-005).
 *
 * Shape-gated on whether the observation is mechanical, not on whether the
 * actor is human — which is why this checks for EITHER of two named
 * disclosure blocks (Meter, for a sampled human observation; Observed at,
 * for a mechanical one) rather than mandating one shape everywhere. A scale
 * with neither is the slot no criterion in the estate has ever carried.
 */

function check(html: string): Finding[] {
  const doc: ParsedDocument = parse(html, 'specs/999-x/spec.html');
  return criterionObservableRule.check({ doc });
}

const wrap = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;
const criterion = (details: string) =>
  wrap(`<spec-criterion id="SC-001" actor="reviewer" validates="FR-001"><p>x</p>${details}</spec-criterion>`);

describe('a criterion carrying an observation', () => {
  it('is silent with a Meter block (human-observed, sampled)', () => {
    expect(check(criterion('<details><summary>Meter</summary><p>y</p></details>'))).toEqual([]);
  });

  it('is silent with an Observed-at block (mechanical, no sampling frame required)', () => {
    expect(check(criterion('<details><summary>Observed at</summary><p>y</p></details>'))).toEqual([]);
  });
});

describe('a criterion with no observation block at all', () => {
  it('is reported', () => {
    const f = check(criterion(''));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/meter|observ/i);
  });

  it('is reported when only an unrelated details block is present', () => {
    const f = check(criterion('<details><summary>Falsified by</summary><p>y</p></details>'));
    expect(f).toHaveLength(1);
  });
});
