import { describe, expect, it } from 'vitest';
import { criterionActorRule } from '../src/rules/criterion-actor.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * Forward-only binding (108-success-criteria, T-300, FR-013).
 *
 * 382 criteria at 2% conformance is not a backlog fixed in one pass, and a
 * gate that fails the whole estate on day one is a gate somebody disables.
 * 108 has no version line of its own to bind from — it amends 091's
 * requirements, not principles.html — so the floor is the spec's own leading
 * number, the same convention verify-view-missing already uses for exactly
 * this retrofit-fairness problem. Exercised against one representative rule
 * (criterion-actor); all six read the same guard.
 */

function check(html: string, file: string): Finding[] {
  const doc: ParsedDocument = parse(html, file);
  return criterionActorRule.check({ doc });
}

const wrap = (body: string) => `<!doctype html><html><body>${body}</body></html>`;
const badCriterion = wrap('<spec-criterion id="SC-001" actor="the verb" validates="FR-001"><p>x</p></spec-criterion>');

describe('a spec below the floor', () => {
  it('is exempt even from a criterion that would fail every rule', () => {
    expect(check(badCriterion, 'specs/001-example/spec.html')).toEqual([]);
    expect(check(badCriterion, 'specs/107-visual-design-brief/spec.html')).toEqual([]);
  });
});

describe('a spec at or above the floor', () => {
  it('is checked normally', () => {
    const f = check(badCriterion, 'specs/108-success-criteria/spec.html');
    expect(f).toHaveLength(1);
  });

  it('is checked normally for a spec authored after 108, too', () => {
    const f = check(badCriterion, 'specs/109-whatever/spec.html');
    expect(f).toHaveLength(1);
  });
});
