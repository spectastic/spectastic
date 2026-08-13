import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `flow-resolves` (100-screen-flows).
 *
 * Half of these assert that the rule stays SILENT. That half is the design: a
 * cycle is ordinary, an absent branch means nobody asked, and an outward step
 * resolves to nothing on purpose — report any of them and the vocabulary
 * becomes unusable for the shapes real products actually have.
 */

const FILE = '/repo/specs/001-a/visual/x.screen.html';
const RULE = 'flow-resolves';

const findingsFor = (body: string) =>
  validate(`<!doctype html><html><head><title>x</title></head><body><main>${body}</main></body></html>`, FILE).filter(
    (f) => f.rule === RULE,
  );

const SCREENS = '<spec-screen id="convert"></spec-screen><spec-screen id="pairs"></spec-screen>';

describe('a document with no journey', () => {
  it('is silent — every screen sidecar in the estate today', () => {
    expect(findingsFor(SCREENS)).toEqual([]);
  });
});

describe('a journey that resolves', () => {
  it('is silent', () => {
    expect(
      findingsFor(`${SCREENS}<spec-flow id="f"><spec-step screen="convert"></spec-step><spec-step screen="pairs"></spec-step></spec-flow>`),
    ).toEqual([]);
  });

  it('is silent for a cycle, which is a loop rather than a contradiction', () => {
    // The precedence graph in core reports a cycle because a cycle there means
    // two specs each claim precedence. A converter that clears and is used
    // again is ordinary, and must not inherit that reading.
    expect(
      findingsFor(
        `${SCREENS}<spec-flow id="f"><spec-step screen="convert"></spec-step><spec-step screen="pairs"></spec-step><spec-step screen="convert"></spec-step></spec-flow>`,
      ),
    ).toEqual([]);
  });

  it('is silent for a step with no branch, since absence means not recorded', () => {
    expect(findingsFor(`${SCREENS}<spec-flow id="f"><spec-step screen="convert"></spec-step></spec-flow>`)).toEqual([]);
  });

  it('is silent for a declared outward step', () => {
    expect(
      findingsFor(`${SCREENS}<spec-flow id="f"><spec-step screen="convert"></spec-step><spec-step outward>the receipt</spec-step></spec-flow>`),
    ).toEqual([]);
  });
});

describe('a journey that does not resolve', () => {
  it('reports a step naming an undeclared screen', () => {
    const f = findingsFor(`${SCREENS}<spec-flow id="f"><spec-step screen="history"></spec-step></spec-flow>`);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('history');
  });

  it('suggests marking it outward, since a boundary is the other likely cause', () => {
    const [f] = findingsFor(`${SCREENS}<spec-flow id="f"><spec-step screen="history"></spec-step></spec-flow>`);
    expect(f?.fixHint).toMatch(/outward/);
  });

  it('reports a step that neither names a screen nor declares a boundary', () => {
    expect(findingsFor(`${SCREENS}<spec-flow id="f"><spec-step></spec-step></spec-flow>`)).toHaveLength(1);
  });

  it('reports a step that is both outward and names a screen', () => {
    const f = findingsFor(`${SCREENS}<spec-flow id="f"><spec-step outward screen="convert"></spec-step></spec-flow>`);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('both leaves the feature');
  });

  it('reports a journey with no steps at all', () => {
    expect(findingsFor(`${SCREENS}<spec-flow id="f"></spec-flow>`)).toHaveLength(1);
  });
});
