import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `annotation-typed` (spec 095, FR-005/FR-007).
 *
 * An annotation is typed by the accessibility tree rather than by a vocabulary
 * invented here — which is not a taste call. `toMatchAriaSnapshot` and a
 * `getByRole` that takes state options both ship in the Playwright installed in
 * this repository, so a declared role and state is already a sentence the test
 * framework reads. That is what makes a declared annotation an assertion.
 *
 * And an annotation that restates a requirement is rejected: a copy is a second
 * thing to drift, and the trace mechanism already aggregates by reference.
 */

const RULE = 'annotation-typed';
const FILE = '/repo/specs/001-a/visual/converter.screen.html';

const doc = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const findingsFor = (body: string) =>
  validate(
    doc(`<spec-screen id="s"><spec-state id="t" source="authored">${body}</spec-state></spec-screen>`),
    FILE,
  ).filter((f) => f.rule === RULE);

describe('a typed annotation', () => {
  it('is silent for a role that takes a state, with one declared', () => {
    expect(findingsFor('<spec-annotation role="textbox" aria-state="invalid"><p>r</p></spec-annotation>')).toEqual([]);
  });

  it('is silent for a role that takes no state', () => {
    expect(findingsFor('<spec-annotation role="heading"><p>r</p></spec-annotation>')).toEqual([]);
  });
});

describe('an annotation with no accessibility analogue', () => {
  it('is silent, and stays prose', () => {
    // FR-006 is explicit: visual emphasis and brand rationale have no analogue.
    // They stay unchecked, and the vocabulary must not pretend otherwise.
    expect(findingsFor('<spec-annotation><p>The emphasis here is brand, not hierarchy.</p></spec-annotation>')).toEqual(
      [],
    );
  });
});

describe('an annotation that is typed wrongly', () => {
  it('flags a role that takes a state with an unrecognised one', () => {
    const f = findingsFor('<spec-annotation role="checkbox" aria-state="wobbly"><p>r</p></spec-annotation>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/wobbly/);
    expect(f[0]?.severity).toBe('error');
  });

  it('flags an aria-state declared with no role to carry it', () => {
    const f = findingsFor('<spec-annotation aria-state="checked"><p>r</p></spec-annotation>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/role/);
  });
});

describe('an annotation that restates a requirement', () => {
  it('flags prose repeating a requirement identifier instead of citing it', () => {
    const f = findingsFor(
      '<spec-annotation><p>Per FR-003 the amount field must reject a negative value.</p></spec-annotation>',
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/cites=/);
  });

  it('is silent when it cites the requirement instead', () => {
    expect(findingsFor('<spec-annotation cites="FR-003"><p>Rejects a negative amount.</p></spec-annotation>')).toEqual(
      [],
    );
  });

  it('does not flag ordinary prose that merely mentions a word like requirement', () => {
    expect(
      findingsFor('<spec-annotation><p>A required field, marked before submission.</p></spec-annotation>'),
    ).toEqual([]);
  });
});

describe('a document with no annotation', () => {
  it('is silent', () => {
    expect(findingsFor('<p>no annotations here</p>')).toEqual([]);
  });
});
