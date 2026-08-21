import { describe, expect, it } from 'vitest';
import { criterionSingleRule } from '../src/rules/criterion-single.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `criterion-single` (108-success-criteria, T-102, FR-008).
 *
 * A criterion joining two outcomes cannot be passed or failed, only
 * half-met — the singular rule is ISO/IEC/IEEE 29148's. Checked against the
 * actor+outcome clause specifically (the text before the scale's em-dash),
 * since the scale/baseline half legitimately uses "and" in plain prose
 * without joining two outcomes.
 */

function check(html: string): Finding[] {
  const doc: ParsedDocument = parse(html, 'specs/999-x/spec.html');
  return criterionSingleRule.check({ doc });
}

const wrap = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;
const criterion = (p: string) =>
  wrap(`<spec-criterion id="SC-001" actor="reviewer" validates="FR-001"><p>${p}</p></spec-criterion>`);

describe('a single outcome', () => {
  it('is silent even when the scale half of the sentence contains "and"', () => {
    const f = check(criterion('A reviewer confirms coverage — captured and not-captured equals N (target N), from 0.'));
    expect(f).toEqual([]);
  });
});

describe('a conjoined outcome', () => {
  it('is reported when the actor clause joins two outcomes with "and"', () => {
    const f = check(criterion('A user logs in and views their dashboard — success rate ≥ 90% (target 98%), from 60%.'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message.toLowerCase()).toContain('conjunction');
  });

  it('catches the determinism-plus-immutability shape design.html names', () => {
    const f = check(
      criterion('The system is deterministic and immutable — regressions ≤ 0 (target 0), from 3 last quarter.'),
    );
    expect(f).toHaveLength(1);
  });
});
