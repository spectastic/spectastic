import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `release-deprecation` (spec 098, FR-008/FR-009).
 *
 * Giving a consumer time: a rename ships the new name plus a working alias, so
 * the old one keeps working for at least one release while telling them what
 * replaced it.
 */

const RULE = 'release-deprecation';
const FILE = '/repo/visual/tokens.html';
const POLICY =
  '<p>MAJOR when a token is removed or its meaning redefined; MINOR when one is added; PATCH otherwise.</p>';
const doc = (r: string) =>
  `<!doctype html><html><head><title>x</title></head><body><spec-token-set version="3.0.0" binds-from="2.0.0">${POLICY}${r}</spec-token-set></body></html>`;
const findingsFor = (r: string) => validate(doc(r), FILE).filter((f) => f.rule === RULE);

describe('deprecating and removing', () => {
  it('is silent when a release only deprecates', () => {
    expect(
      findingsFor(
        '<spec-release from="2.0.0" to="2.1.0" class="minor" deprecates="legacy.accent"><p>a</p></spec-release>',
      ),
    ).toEqual([]);
  });

  it('is silent when a later release removes what an earlier one deprecated', () => {
    expect(
      findingsFor(
        `<spec-release from="2.0.0" to="2.1.0" class="minor" deprecates="legacy.accent"><p>a</p></spec-release>
         <spec-release from="2.1.0" to="3.0.0" class="major" removes="legacy.accent"><p>b</p></spec-release>`,
      ),
    ).toEqual([]);
  });

  it('flags a release that removes a token it deprecates in the same breath', () => {
    const f = findingsFor(
      '<spec-release from="2.0.0" to="3.0.0" class="major" deprecates="legacy.accent" removes="legacy.accent"><p>a</p></spec-release>',
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/legacy\.accent/);
  });
});

describe('a removal is classified at the highest tier (FR-009)', () => {
  it('flags a removal classified minor', () => {
    const f = findingsFor(
      '<spec-release from="2.0.0" to="2.1.0" class="minor" removes="legacy.accent"><p>a</p></spec-release>',
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/major/);
  });

  it('is silent for a removal classified major', () => {
    expect(
      findingsFor(
        '<spec-release from="2.0.0" to="3.0.0" class="major" removes="legacy.accent"><p>a</p></spec-release>',
      ),
    ).toEqual([]);
  });
});

describe("the deprecation channel is the token format's own (FR-007)", () => {
  it('this project defines no deprecation element of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/schema/'));
    const vocab = readFileSync(join(root, 'packages/schema/src/visual-vocabulary.ts'), 'utf8');
    // A parallel mechanism would make a rename legible to this tool and
    // invisible to every other one that reads the token file.
    expect(vocab).not.toMatch(/DEPRECATION_ELEMENT|spec-deprecat/);
  });
});
