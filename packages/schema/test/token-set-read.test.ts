import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { readTokenSet } from '../src/token-set.js';

/**
 * Reading the token set (spec 098, FR-001/FR-002/FR-010, design D-002).
 *
 * The most important assertion here is an absence: this module must contain no
 * comparison between two versions. A tool that can order versions can offer
 * "you are three releases behind", which is genuinely useful and requires a
 * format contract nothing in this project has committed to.
 */

const doc = (body: string) => parse(`<!doctype html><html><body>${body}</body></html>`, 'visual/tokens.html');

const SET = `<spec-token-set version="2.1.0" binds-from="2.0.0" external-base="@acme/tokens@4.2.0">
  <p>MAJOR when a token is removed or its meaning redefined; MINOR when one is added or deprecated; PATCH for a value change that alters no binding.</p>
  <spec-release from="2.0.0" to="2.1.0" class="minor" deprecates="legacy.accent"><p>Added color.accent.</p></spec-release>
</spec-token-set>`;

describe('what the token set carries', () => {
  it('reads the version, the forward-only binding and the external base separately', () => {
    const set = readTokenSet(doc(SET));
    expect(set).toMatchObject({ version: '2.1.0', bindsFrom: '2.0.0', externalBase: '@acme/tokens@4.2.0' });
  });

  it("keeps the bump policy as the element's own prose", () => {
    // FR-001: the policy lives in the artifact carrying the version, because a
    // policy elsewhere is one nobody reads at the moment of bumping.
    expect(readTokenSet(doc(SET))?.policy).toMatch(/MAJOR when a token is removed/);
  });

  it("excludes a release's prose from the policy", () => {
    expect(readTokenSet(doc(SET))?.policy).not.toMatch(/Added color.accent/);
  });

  it('reads releases in document order', () => {
    const set = readTokenSet(
      doc(`<spec-token-set version="3.0.0" binds-from="2.0.0"><p>policy</p>
        <spec-release from="2.0.0" to="2.1.0" class="minor"><p>a</p></spec-release>
        <spec-release from="2.1.0" to="3.0.0" class="major" removes="legacy.accent"><p>b</p></spec-release>
      </spec-token-set>`),
    );
    expect(set?.releases.map((r) => r.to)).toEqual(['2.1.0', '3.0.0']);
  });
});

describe('a document with no token set', () => {
  it('returns null rather than throwing', () => {
    expect(readTokenSet(doc('<p>ordinary</p>'))).toBeNull();
  });
});

describe('NFR-001 · equality only, no ordering', () => {
  it('the module contains no comparison between two versions', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/schema/'));
    const src = readFileSync(join(root, 'packages/schema/src/token-set.ts'), 'utf8');
    // Not "does not call a comparator" — contains none. The requirement is
    // about what this code must never learn to do.
    expect(src).not.toMatch(/localeCompare|semver|\bgt\(|\blt\(|compareVersions|\.sort\(/);
  });
});
