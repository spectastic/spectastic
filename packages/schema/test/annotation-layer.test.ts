import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';
import { RECOGNISED_LAYERS, impliedLayers } from '../src/visual-vocabulary.js';

/**
 * The annotation's layer and target (095 FR-011/FR-012, applied change
 * 2026-08-13-annotate-the-element).
 *
 * The design decision under test is that `impliedLayers` returns a SET. An
 * annotation typed more than one way at once is legitimately more than one
 * layer, and collapsing that by precedence would manufacture a disagreement out
 * of an annotation that is simply both.
 */

const FILE = '/repo/specs/001-a/visual/x.screen.html';
const RULE = 'annotation-typed';

function findingsFor(body: string) {
  const doc = `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
  return validate(doc, FILE).filter((f) => f.rule === RULE);
}

const screen = (annotation: string) =>
  `<spec-screen id="s"><spec-state id="a" source="authored">${annotation}</spec-state></spec-screen>`;

describe('impliedLayers', () => {
  it('implies behaviour from an accessibility state', () => {
    expect([...impliedLayers({ ariaState: 'disabled' })]).toEqual(['behaviour']);
  });

  it('implies structure from a role', () => {
    expect([...impliedLayers({ role: 'button' })]).toEqual(['structure']);
  });

  it('implies requirement from a citation', () => {
    expect([...impliedLayers({ cites: 'NFR-001' })]).toEqual(['requirement']);
  });

  it('implies both when an annotation is typed both ways', () => {
    const set = impliedLayers({ role: 'button', cites: 'NFR-001' });
    expect(set.has('structure')).toBe(true);
    expect(set.has('requirement')).toBe(true);
  });

  it('implies nothing when nothing types it — which is what permits the unmapped layers', () => {
    expect(impliedLayers({}).size).toBe(0);
  });
});

describe('a declared layer', () => {
  it('is silent when it agrees with the typing', () => {
    expect(findingsFor(screen('<spec-annotation role="button" layer="structure"><p>x</p></spec-annotation>'))).toEqual(
      [],
    );
  });

  it('is silent when it matches one of several implied layers', () => {
    // Typed twice, so both answers are right. This is the case a precedence
    // ladder would have got wrong.
    expect(
      findingsFor(
        screen('<spec-annotation role="button" cites="NFR-001" layer="requirement"><p>x</p></spec-annotation>'),
      ),
    ).toEqual([]);
  });

  it('is reported when it disagrees with the typing', () => {
    const f = findingsFor(screen('<spec-annotation role="button" layer="content"><p>x</p></spec-annotation>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('content');
  });

  it('is silent for a layer with no accessibility analogue, since nothing implies one', () => {
    expect(findingsFor(screen('<spec-annotation layer="tracking"><p>x</p></spec-annotation>'))).toEqual([]);
  });

  it('is reported when it is not a recognised layer at all', () => {
    const f = findingsFor(screen('<spec-annotation layer="vibes"><p>x</p></spec-annotation>'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('vibes');
  });
});

describe('a declared target', () => {
  it('is never resolved and never reported, whatever it names', () => {
    expect(
      findingsFor(screen('<spec-annotation target="convert-button" role="button"><p>x</p></spec-annotation>')),
    ).toEqual([]);
    expect(findingsFor(screen('<spec-annotation target="anything-at-all"><p>x</p></spec-annotation>'))).toEqual([]);
  });
});

describe('the layer vocabulary', () => {
  it('covers every layer the survey kept', () => {
    for (const l of ['structure', 'behaviour', 'requirement', 'motion', 'data', 'accessibility', 'tracking', 'content'])
      expect(RECOGNISED_LAYERS).toContain(l);
  });
});
