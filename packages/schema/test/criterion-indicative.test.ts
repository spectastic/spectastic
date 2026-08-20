import { describe, expect, it } from 'vitest';
import { criterionIndicativeRule } from '../src/rules/criterion-indicative.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `criterion-indicative` (108-success-criteria, T-103, FR-009).
 *
 * The indicative mood is the point: "reviewers confirm…", not "the system
 * MUST allow reviewers to confirm…". An author reaching for MUST has written
 * a requirement, and this is the cheapest possible detector for that
 * mistake — checked both as a nested <spec-rule> (the requirement-authoring
 * convention) and as a bare uppercase keyword in the criterion's own prose.
 */

function check(html: string): Finding[] {
  const doc: ParsedDocument = parse(html, 'specs/999-x/spec.html');
  return criterionIndicativeRule.check({ doc });
}

const wrap = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;
const criterion = (body: string) =>
  wrap(`<spec-criterion id="SC-001" actor="reviewer" validates="FR-001">${body}</spec-criterion>`);

describe('the indicative mood', () => {
  it('is silent for plain observation prose', () => {
    expect(check(criterion('<p>A reviewer confirms coverage without opening the artifact.</p>'))).toEqual([]);
  });

  it('does not false-positive on a lowercase "must" inside ordinary prose', () => {
    // "must" as an ordinary English word (not the RFC 2119 keyword) is fine —
    // the check is on the uppercase convention this project's requirements use.
    expect(check(criterion('<p>A reviewer sees what they must confirm before signing off.</p>'))).toEqual([]);
  });
});

describe('an RFC 2119 keyword', () => {
  it('is reported when nested in a <spec-rule>', () => {
    const f = check(criterion('<p>The system <spec-rule>MUST</spec-rule> allow reviewers to confirm coverage.</p>'));
    expect(f).toHaveLength(1);
  });

  it('is reported as a bare uppercase keyword with no <spec-rule> wrapper', () => {
    const f = check(criterion('<p>Reviewers SHOULD confirm coverage before merge.</p>'));
    expect(f).toHaveLength(1);
  });
});
