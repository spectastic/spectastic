import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * Unit tests for the `visual-declaration-shape` rule (spec
 * 093-design-visual-section, FR-009). Written before the rule exists, per the
 * design's test-first discipline.
 *
 * Scope, cloned from `contract-declaration-shape`: the rule fires only on a
 * PRESENT <spec-visual> that is malformed. It never fires on a document with
 * no declaration at all, so every one of the pre-existing designs in the
 * estate stays silent — which is what makes landing it a non-event.
 */

const RULE = 'visual-declaration-shape';
const FILE = '/repo/specs/001-a/design.html';

function doc(body: string): string {
  return `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
}

function findingsFor(body: string) {
  return validate(doc(body), FILE).filter((f) => f.rule === RULE);
}

const WELL_FORMED =
  '<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual" source="figma"><p>r</p></spec-visual>';

describe('a document with no declaration', () => {
  it('is silent — the common case, and every design in the estate today', () => {
    expect(findingsFor('<p>an ordinary design</p>')).toEqual([]);
  });
});

describe('a well-formed declaration', () => {
  it('is silent', () => {
    expect(findingsFor(WELL_FORMED)).toEqual([]);
  });

  it('is silent for an explicit none carrying no paths', () => {
    expect(findingsFor('<spec-visual shape="none"><p>no screen</p></spec-visual>')).toEqual([]);
  });

  it('is silent when a token set extends an external base', () => {
    expect(
      findingsFor(
        '<spec-visual shape="screens" tokens="visual/tokens" tokens-external="@acme/tokens" screens="specs/001-a/visual" source="figma"><p>r</p></spec-visual>',
      ),
    ).toEqual([]);
  });
});

describe('a present but malformed declaration', () => {
  it('flags a missing shape=', () => {
    const f = findingsFor('<spec-visual tokens="visual/tokens"><p>r</p></spec-visual>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/shape=/);
    expect(f[0]?.severity).toBe('error');
  });

  it('flags an unrecognised shape=', () => {
    const f = findingsFor('<spec-visual shape="mockups"><p>r</p></spec-visual>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/mockups/);
  });

  it('flags a surface declared with no token path', () => {
    const f = findingsFor(
      '<spec-visual shape="screens" screens="specs/001-a/visual" source="figma"><p>r</p></spec-visual>',
    );
    expect(f.map((x) => x.message).join('\n')).toMatch(/tokens=/);
  });

  it('flags a surface declared with no screens path', () => {
    const f = findingsFor('<spec-visual shape="screens" tokens="visual/tokens" source="figma"><p>r</p></spec-visual>');
    expect(f.map((x) => x.message).join('\n')).toMatch(/screens=/);
  });

  it('flags a surface declared with no source', () => {
    const f = findingsFor(
      '<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual"><p>r</p></spec-visual>',
    );
    expect(f.map((x) => x.message).join('\n')).toMatch(/source=/);
  });

  it('reports each violation granularly rather than stopping at the first', () => {
    const f = findingsFor('<spec-visual shape="screens"><p>r</p></spec-visual>');
    expect(f).toHaveLength(3); // tokens, screens, source
  });

  it('does not also demand paths once the shape itself is unusable', () => {
    // An absent shape cannot be checked for coherence with its paths; flagging
    // both would report one mistake three times.
    expect(findingsFor('<spec-visual><p>r</p></spec-visual>')).toHaveLength(1);
  });
});

describe('incoherent combinations', () => {
  it('flags an external token base with no local token path to extend', () => {
    const f = findingsFor('<spec-visual shape="screens" tokens-external="@acme/tokens"><p>r</p></spec-visual>');
    expect(f.map((x) => x.message).join('\n')).toMatch(/tokens-external/);
  });

  it('flags an explicit none that nonetheless names a path', () => {
    const f = findingsFor('<spec-visual shape="none" tokens="visual/tokens"><p>r</p></spec-visual>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/none/);
  });
});

describe('several declarations in one document', () => {
  it('reports each independently', () => {
    expect(findingsFor(`${WELL_FORMED}<spec-visual shape="mockups"><p>r</p></spec-visual>`)).toHaveLength(1);
  });
});

/**
 * The grid and coverage attributes (093 FR-005/FR-012, applied change
 * 2026-08-13-declare-the-variant-grid). The asymmetry is the point: an absent
 * grid is silence, because nothing obliges a project to have one, while a
 * coverage claim about an unnamed grid is a claim about nothing.
 */
describe('the variant grid and the contexts a feature addresses', () => {
  const FULL = 'shape="screens" tokens="visual/tokens" screens="specs/001-a/visual" source="figma"';
  const vis = (attrs: string) => `<spec-visual ${attrs}><p>r</p></spec-visual>`;

  it('is silent when a declared surface names no variant grid', () => {
    // Nothing obliges a project to HAVE a grid — 096 FR-008 governs its scope,
    // not its existence — so a single-axis project must not be pushed into
    // authoring a fictional one to clear an error.
    expect(findingsFor(vis(FULL))).toEqual([]);
  });

  it('is silent when it names one', () => {
    expect(findingsFor(vis(`${FULL} variants="visual/variants.html"`))).toEqual([]);
  });

  it('reports a coverage claim with no grid to make it against', () => {
    const f = findingsFor(vis(`${FULL} contexts="platform=ios"`));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('contexts=');
  });

  it('is silent for coverage alongside a grid', () => {
    expect(findingsFor(vis(`${FULL} variants="visual/variants.html" contexts="platform=ios mode=dark"`))).toEqual([]);
  });

  it('is silent for an explicit whole-grid claim', () => {
    expect(findingsFor(vis(`${FULL} variants="visual/variants.html" contexts="all"`))).toEqual([]);
  });

  it('reports an explicit none that nonetheless names a grid', () => {
    expect(findingsFor(vis('shape="none" variants="visual/variants.html"'))).toHaveLength(1);
  });

  it('reports an explicit none that nonetheless claims coverage', () => {
    expect(findingsFor(vis('shape="none" contexts="all"'))).toHaveLength(1);
  });
});
