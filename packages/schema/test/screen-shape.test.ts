import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `screen-shape` (spec 095-visual-element-vocabulary, FR-001/FR-008).
 *
 * A screen is a named surface with a stable identifier, and a state belongs to
 * one. The rule fires only on a present-but-malformed declaration and returns
 * immediately on a document with no screen — which is NFR-002, and also every
 * artifact in the estate today.
 */

const RULE = 'screen-shape';
const FILE = '/repo/specs/001-a/visual/converter.screen.html';

const doc = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const findingsFor = (body: string) => validate(doc(body), FILE).filter((f) => f.rule === RULE);

const WELL_FORMED = `<spec-screen id="converter" name="converter" serves="US1">
  <spec-state id="converted" source="derived" from="200"><p>r</p></spec-state>
</spec-screen>`;

describe('a document with no screen', () => {
  it('is silent — every artifact in the estate today', () => {
    expect(findingsFor('<p>an ordinary artifact</p>')).toEqual([]);
  });
});

describe('a well-formed screen', () => {
  it('is silent', () => {
    expect(findingsFor(WELL_FORMED)).toEqual([]);
  });

  it('is silent for a screen with no states yet', () => {
    expect(findingsFor('<spec-screen id="empty" name="empty"><p>not drawn yet</p></spec-screen>')).toEqual([]);
  });

  it('is silent for several screens in one feature, per FR-010', () => {
    expect(findingsFor(`${WELL_FORMED}<spec-screen id="history" name="history"><p>r</p></spec-screen>`)).toEqual([]);
  });
});

describe('a malformed screen', () => {
  it('flags a screen with no id — the identifier is a contract', () => {
    const f = findingsFor('<spec-screen><p>r</p></spec-screen>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/id=/);
    expect(f[0]?.severity).toBe('error');
  });

  it('flags two screens sharing an id in one artifact', () => {
    const f = findingsFor('<spec-screen id="a" name="a"><p>r</p></spec-screen><spec-screen id="a" name="a"><p>r</p></spec-screen>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/\ba\b/);
  });
});

describe('a state outside a screen', () => {
  it('flags it — a state belongs to exactly one screen', () => {
    const f = findingsFor('<spec-state id="loose" source="authored"><p>r</p></spec-state>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/screen/i);
  });

  it('flags a state with no id', () => {
    const f = findingsFor('<spec-screen id="s" name="s"><spec-state source="authored"><p>r</p></spec-state></spec-screen>');
    expect(f.map((x) => x.message).join('\n')).toMatch(/id=/);
  });
});
