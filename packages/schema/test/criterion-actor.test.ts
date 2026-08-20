import { describe, expect, it } from 'vitest';
import { criterionActorRule } from '../src/rules/criterion-actor.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `criterion-actor` (108-success-criteria, T-100, FR-002).
 *
 * The highest-value slot: 98% of the estate's existing criteria fail it.
 * `actor=` is declared rather than inferred from the sentence (D-...'s own
 * grounding — a glossary-based subject parse was the first design and only
 * 1 of 102 specs has a glossary), so this is a presence-plus-denylist check
 * on one attribute, not a parse of prose.
 */

function check(html: string): Finding[] {
  const doc: ParsedDocument = parse(html, 'specs/999-x/spec.html');
  return criterionActorRule.check({ doc });
}

const wrap = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;
const criterion = (attrs: string, body = '<p>x</p>') => wrap(`<spec-criterion id="SC-001" ${attrs}>${body}</spec-criterion>`);

describe('a declared actor', () => {
  it('is silent for a person', () => {
    expect(check(criterion('actor="reviewer" validates="FR-001"'))).toEqual([]);
  });

  it('is silent for an organisation', () => {
    expect(check(criterion('actor="the support team" validates="FR-001"'))).toEqual([]);
  });
});

describe('a missing or artifact actor', () => {
  it('is reported when actor= is absent entirely', () => {
    const f = check(criterion('validates="FR-001"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('actor=');
  });

  it('is reported when actor= names the tool\'s own vocabulary', () => {
    const f = check(criterion('actor="the verb" validates="FR-001"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('"the verb"');
  });

  it('is reported for the four originals this rule exists to catch', () => {
    for (const actor of ['an image', 'the number captured', 'the number of capture files', 'the verb']) {
      const f = check(criterion(`actor="${actor}" validates="FR-001"`));
      expect(f, actor).toHaveLength(1);
    }
  });
});
