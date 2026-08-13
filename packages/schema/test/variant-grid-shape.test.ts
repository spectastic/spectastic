import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `variant-grid-shape` (spec 096, FR-001/FR-002/FR-003/FR-004/FR-005).
 *
 * One rule gathering the obligations an axis, a context and a baseline each
 * carry, reported granularly so a finding names which was missed.
 *
 * The most important test here is the one asserting what the tool does NOT
 * produce. A three-by-three grid is nine combinations and this rule must report
 * one finding, not nine — design D-001 refuses a completeness check because a
 * coverage number over a combinatorial grid recreates the 77 unanswerable gap
 * rows the observables trace already produced in this repository. A refusal
 * with no test is a comment.
 */

const RULE = 'variant-grid-shape';
const FILE = '/repo/visual/variants.html';

const doc = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const findingsFor = (body: string) => validate(doc(body), FILE).filter((f) => f.rule === RULE);
const grid = (inner: string) => `<spec-variant-grid>${inner}</spec-variant-grid>`;

describe('a document with no grid', () => {
  it('is silent — every artifact in the estate today', () => {
    expect(findingsFor('<p>ordinary</p>')).toEqual([]);
  });

  it('is silent for a grid declaring no axes, since a project may have none', () => {
    expect(findingsFor(grid('<p>none yet</p>'))).toEqual([]);
  });
});

describe('a well-formed grid', () => {
  it('is silent', () => {
    expect(
      findingsFor(
        grid(`<spec-axis name="mode" default="light">
          <spec-context name="light"></spec-context>
          <spec-context name="dark"></spec-context>
        </spec-axis>`),
      ),
    ).toEqual([]);
  });
});

describe('axes and contexts', () => {
  it('flags an axis with no name', () => {
    const f = findingsFor(grid('<spec-axis default="a"><spec-context name="a"></spec-context></spec-axis>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/name=/);
  });

  it('flags a context with no name', () => {
    const f = findingsFor(grid('<spec-axis name="mode" default="light"><spec-context></spec-context></spec-axis>'));
    expect(f.map((x) => x.message).join('\n')).toMatch(/name=/);
  });

  it('flags an axis whose default names no context it declares', () => {
    const f = findingsFor(
      grid('<spec-axis name="mode" default="sepia"><spec-context name="light"></spec-context></spec-axis>'),
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/sepia/);
  });

  it('flags an unrecognised selects=', () => {
    const f = findingsFor(
      grid(
        '<spec-axis name="mode" default="light" selects="vibes"><spec-context name="light"></spec-context></spec-axis>',
      ),
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/vibes/);
  });
});

describe('a declined context (FR-003)', () => {
  it('is silent when it carries a reason', () => {
    expect(
      findingsFor(
        grid(`<spec-axis name="platform" default="ios">
          <spec-context name="ios"></spec-context>
          <spec-context name="tv" declined><p>A converter wants a keyboard.</p></spec-context>
        </spec-axis>`),
      ),
    ).toEqual([]);
  });

  it('flags a decline with no reason — a bare flag is the failure this prevents', () => {
    const f = findingsFor(
      grid(`<spec-axis name="platform" default="ios">
        <spec-context name="ios"></spec-context>
        <spec-context name="tv" declined></spec-context>
      </spec-axis>`),
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/reason/i);
  });
});

describe('a baseline (FR-004/FR-005)', () => {
  const withBaseline = (b: string) =>
    findingsFor(
      grid(`<spec-axis name="platform" default="ios"><spec-context name="ios">${b}</spec-context></spec-axis>`),
    );

  it('is silent for a verified baseline', () => {
    expect(withBaseline('<spec-baseline designed="iOS 26.0" verified="iOS 26.1"/>')).toEqual([]);
  });

  it('is silent for verified="none" — never verified is a VALUE', () => {
    expect(withBaseline('<spec-baseline designed="iOS 26.0" verified="none"/>')).toEqual([]);
  });

  it('flags a baseline with no verified, because the gap must be visible not absent', () => {
    const f = withBaseline('<spec-baseline designed="iOS 26.0"/>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/verified=/);
  });

  it('flags a baseline with no designed', () => {
    const f = withBaseline('<spec-baseline verified="none"/>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/designed=/);
  });
});

describe('the grid never manufactures work (D-001)', () => {
  it('a 3x3 grid with one problem reports 1 finding, not 9', () => {
    // The anti-busywork assertion. If this ever reports a finding per
    // combination, the completeness check has come back by another route.
    const threeByThree = grid(`
      <spec-axis name="platform" default="ios">
        <spec-context name="ios"></spec-context><spec-context name="macos"></spec-context><spec-context name="tv"></spec-context>
      </spec-axis>
      <spec-axis name="mode" default="light">
        <spec-context name="light"></spec-context><spec-context name="dark"></spec-context><spec-context name="contrast"></spec-context>
      </spec-axis>
      <spec-axis name="size"><spec-context></spec-context></spec-axis>`);
    // Exactly ONE problem in the fixture — an unnamed context — so the count
    // being 1 means the rule reports per problem, not per combination.
    expect(findingsFor(threeByThree)).toHaveLength(1);
  });

  it('a fully-formed 3x3 grid with no same-as entries at all is silent', () => {
    const clean = grid(`
      <spec-axis name="platform" default="ios">
        <spec-context name="ios"></spec-context><spec-context name="macos"></spec-context><spec-context name="tv"></spec-context>
      </spec-axis>
      <spec-axis name="mode" default="light">
        <spec-context name="light"></spec-context><spec-context name="dark"></spec-context><spec-context name="contrast"></spec-context>
      </spec-axis>`);
    expect(findingsFor(clean)).toEqual([]);
  });
});
