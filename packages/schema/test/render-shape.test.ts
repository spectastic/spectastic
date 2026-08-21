import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `render-shape` (099-visual-embedded-view, FR-008/FR-009).
 *
 * The rule that must NOT exist here is as important as the ones that do: an
 * absent render is never a finding (FR-009), so this rule only ever fires on a
 * render that is PRESENT and malformed. A project that commits no images must
 * stay silent, or a render stops being evidence and becomes a dependency.
 */

const FILE = '/repo/specs/001-a/visual/x.screen.html';
const RULE = 'render-shape';

const findingsFor = (body: string) =>
  validate(`<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`, FILE).filter(
    (f) => f.rule === RULE,
  );

const screen = (inner: string) =>
  `<spec-screen id="s"><spec-state id="converted" source="derived" from="200">${inner}</spec-state></spec-screen>`;

describe('a document with no render', () => {
  it('is silent — every screen in the estate today, and the common case forever', () => {
    expect(findingsFor(screen('<p>a state with no evidence</p>'))).toEqual([]);
  });
});

describe('a well-formed render', () => {
  it('is silent', () => {
    expect(
      findingsFor(
        screen('<spec-render src="renders/converted-ios-light.png" contexts="platform=ios mode=light"></spec-render>'),
      ),
    ).toEqual([]);
  });

  it('is silent with no contexts, which means the cell is the state alone', () => {
    expect(findingsFor(screen('<spec-render src="renders/converted.png"></spec-render>'))).toEqual([]);
  });
});

describe('a malformed render', () => {
  it('reports one naming no source', () => {
    const f = findingsFor(screen('<spec-render contexts="platform=ios"></spec-render>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('src=');
  });

  it('reports a contexts list that is not axis=context pairs', () => {
    const f = findingsFor(screen('<spec-render src="a.png" contexts="ios dark"></spec-render>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('contexts=');
  });

  it('reports an empty src rather than treating it as absent', () => {
    // "" is a declaration that names nothing, which is different from making no
    // declaration at all — the distinction this whole family keeps.
    expect(findingsFor(screen('<spec-render src=""></spec-render>'))).toHaveLength(1);
  });
});

describe('a render outside a state', () => {
  it('is still read, since position is a convention rather than a constraint', () => {
    expect(findingsFor('<spec-screen id="s"><spec-render src="a.png"></spec-render></spec-screen>')).toEqual([]);
  });
});
