import { describe, expect, it } from 'vitest';
import { criterionValidatesRule } from '../src/rules/criterion-validates.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `criterion-validates` (108-success-criteria, T-104, FR-007, SC-002).
 *
 * Both directions of the GQM relation, in one rule: a criterion with no
 * validates= is reported (it validates nothing), and a requirement no
 * criterion validates is reported (a gap nobody agreed how to judge) —
 * but only once the document has adopted at least one criterion at all.
 * Absence is never a finding (093's own precedent): a spec with zero
 * criteria has not adopted this contract, and flagging every requirement
 * in it as "orphaned" would fail the entire pre-108 estate on day one.
 */

function check(html: string): Finding[] {
  const doc: ParsedDocument = parse(html, 'specs/999-x/spec.html');
  return criterionValidatesRule.check({ doc });
}

const wrap = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;

describe('a criterion with no validates=', () => {
  it('is reported when validates= is absent', () => {
    const html = wrap('<spec-requirement id="FR-001"><p>x</p></spec-requirement><spec-criterion id="SC-001" actor="reviewer"><p>x</p></spec-criterion>');
    const f = check(html);
    expect(f.some((x) => x.message.includes('validates='))).toBe(true);
  });

  it('is reported when validates= is empty or whitespace', () => {
    const html = wrap('<spec-requirement id="FR-001"><p>x</p></spec-requirement><spec-criterion id="SC-001" actor="reviewer" validates="  "><p>x</p></spec-criterion>');
    expect(check(html).some((x) => x.message.includes('validates='))).toBe(true);
  });
});

describe('a document with zero criteria', () => {
  it('reports nothing at all — absence is never a finding', () => {
    const html = wrap('<spec-requirement id="FR-001"><p>x</p></spec-requirement><spec-requirement id="FR-002"><p>x</p></spec-requirement>');
    expect(check(html)).toEqual([]);
  });
});

describe('a requirement no criterion validates', () => {
  it('is reported once the document has adopted at least one criterion', () => {
    const html = wrap(
      '<spec-requirement id="FR-001"><p>x</p></spec-requirement>' +
        '<spec-requirement id="FR-002"><p>x</p></spec-requirement>' +
        '<spec-criterion id="SC-001" actor="reviewer" validates="FR-001"><p>x</p></spec-criterion>',
    );
    const f = check(html);
    const orphan = f.find((x) => x.message.includes('FR-002'));
    expect(orphan).toBeDefined();
    expect(f.some((x) => x.message.includes('FR-001'))).toBe(false);
  });

  it('is silent when every requirement is validated by some criterion', () => {
    const html = wrap(
      '<spec-requirement id="FR-001"><p>x</p></spec-requirement>' +
        '<spec-criterion id="SC-001" actor="reviewer" validates="FR-001,FR-002"><p>x</p></spec-criterion>' +
        '<spec-requirement id="FR-002"><p>x</p></spec-requirement>',
    );
    expect(check(html)).toEqual([]);
  });
});
