import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/** `token-set-shape` (spec 098, FR-001/FR-002/FR-005). */

const RULE = 'token-set-shape';
const FILE = '/repo/visual/tokens.html';
const doc = (b: string) => `<!doctype html><html><head><title>x</title></head><body>${b}</body></html>`;
const findingsFor = (b: string) => validate(doc(b), FILE).filter((f) => f.rule === RULE);

const POLICY =
  '<p>MAJOR when a token is removed or its meaning redefined; MINOR when one is added; PATCH otherwise.</p>';
const OK = `<spec-token-set version="2.1.0" binds-from="2.0.0">${POLICY}</spec-token-set>`;

describe('a document with no token set', () => {
  it('is silent', () => expect(findingsFor('<p>ordinary</p>')).toEqual([]));
});

describe('a well-formed token set', () => {
  it('is silent', () => expect(findingsFor(OK)).toEqual([]));
});

describe('the version and its binding', () => {
  it('flags a missing version', () => {
    expect(findingsFor(`<spec-token-set binds-from="2.0.0">${POLICY}</spec-token-set>`)).toHaveLength(1);
  });

  it('flags a missing forward-only binding — the clause that makes bumping affordable', () => {
    const f = findingsFor(`<spec-token-set version="2.1.0">${POLICY}</spec-token-set>`);
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/binds-from/);
  });
});

describe('the bump policy must be in this artifact (FR-001)', () => {
  it('flags a token set stating no policy', () => {
    const f = findingsFor('<spec-token-set version="2.1.0" binds-from="2.0.0"></spec-token-set>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/policy/i);
  });

  it('flags a token gesture rather than a policy', () => {
    expect(
      findingsFor('<spec-token-set version="2.1.0" binds-from="2.0.0"><p>semver</p></spec-token-set>'),
    ).toHaveLength(1);
  });
});

describe('a release (FR-004/FR-005)', () => {
  const withRelease = (r: string) =>
    findingsFor(`<spec-token-set version="2.1.0" binds-from="2.0.0">${POLICY}${r}</spec-token-set>`);

  it('is silent for a tier-classified release declaring both versions', () => {
    expect(withRelease('<spec-release from="2.0.0" to="2.1.0" class="minor"><p>a</p></spec-release>')).toEqual([]);
  });

  it('flags a class outside the three bump tiers', () => {
    const f = withRelease('<spec-release from="2.0.0" to="2.1.0" class="breaking"><p>a</p></spec-release>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/breaking/);
  });

  it('flags a release that does not declare both versions', () => {
    expect(withRelease('<spec-release to="2.1.0" class="minor"><p>a</p></spec-release>')).toHaveLength(1);
  });
});

describe('the forward-only binding is recoverable (FR-003/US1)', () => {
  it('a screen stamped with an earlier version keeps that stamp after a later one lands', () => {
    // The version a screen was accepted under stays legible on the screen; a
    // later token-set version does not rewrite or invalidate it.
    const html = doc(
      `<spec-token-set version="3.0.0" binds-from="2.0.0">${POLICY}</spec-token-set>
       <spec-screen id="convert" tokens-version="2.0.0"><spec-state id="a" source="authored"><p>r</p></spec-state></spec-screen>`,
    );
    expect(validate(html, FILE).filter((f) => f.rule === RULE)).toEqual([]);
    expect(html).toContain('tokens-version="2.0.0"');
  });
});
