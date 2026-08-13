import { describe, expect, it } from 'vitest';
import { validate } from '../src/index.js';

/**
 * `component-provenance` (spec 097, FR-007/FR-008/FR-009, design D-001/D-005).
 *
 * Copying a component into a repository is a licensing event as much as an
 * engineering one, and nothing in design tooling records it. The field set is
 * the corpus's, because taking a component in is the same act as taking a
 * document in — and so is the severity split: being behind upstream should nag,
 * pointing at nothing should fail.
 *
 * Nothing here fetches. "Unresolvable" means undeclared in this project, not
 * unreachable over a network.
 */

const RULE = 'component-provenance';
const FILE = '/repo/visual/components.html';

const doc = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;
const findingsFor = (body: string) => validate(doc(body), FILE).filter((f) => f.rule === RULE);

const VENDORED =
  '<spec-component name="chip" scope="project" maturity="accepted" origin="vendored" origin-url="https://ui.example/chip" edition="1.4.0" license="MIT"/>';

describe('an origin that owes no provenance', () => {
  it('is silent for an authored component', () => {
    expect(findingsFor('<spec-component name="b" scope="project" maturity="accepted" origin="authored"/>')).toEqual([]);
  });

  it('is silent for a consumed component, which has no file here to have taken', () => {
    expect(findingsFor('<spec-component name="g" scope="project" maturity="accepted" origin="consumed"/>')).toEqual([]);
  });
});

describe('a vendored component (FR-008)', () => {
  it('is silent when it records where it came from', () => {
    expect(findingsFor(VENDORED)).toEqual([]);
  });

  it('flags a missing origin-url', () => {
    const f = findingsFor(
      '<spec-component name="chip" scope="project" maturity="accepted" origin="vendored" edition="1.4.0" license="MIT"/>',
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/origin-url/);
  });

  it('flags a missing licence — the field with a legal consequence', () => {
    const f = findingsFor(
      '<spec-component name="chip" scope="project" maturity="accepted" origin="vendored" origin-url="https://ui.example/chip" edition="1.4.0"/>',
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/license/);
  });

  it('reports each missing field separately', () => {
    expect(
      findingsFor('<spec-component name="chip" scope="project" maturity="accepted" origin="vendored"/>'),
    ).toHaveLength(3);
  });
});

describe('a wrapper references rather than copies (FR-007, D-001)', () => {
  it('is silent for a wrapper whose reference resolves', () => {
    expect(
      findingsFor(
        `${VENDORED}<spec-component name="pay-chip" scope="feature" maturity="draft" origin="authored" wraps="chip"/>`,
      ),
    ).toEqual([]);
  });

  it('errors when the wrapped component is not declared here', () => {
    const f = findingsFor(
      '<spec-component name="pay-chip" scope="feature" maturity="draft" origin="authored" wraps="ghost"/>',
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('error');
    expect(f[0]?.message).toMatch(/ghost/);
  });

  it('flags a wrapper that copies provenance instead of referencing it', () => {
    // Two records of a licence will diverge, and a diverged licence record is
    // worse than none because it looks authoritative.
    const f = findingsFor(
      `${VENDORED}<spec-component name="pay-chip" scope="feature" maturity="draft" origin="authored" wraps="chip" license="MIT"/>`,
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/wraps/);
  });
});

describe('the severity split (FR-009)', () => {
  it('warns on a reference to a superseded component — being behind should nag', () => {
    const f = findingsFor(
      `<spec-component name="chip" scope="project" maturity="superseded" origin="vendored" origin-url="https://ui.example/chip" edition="1.4.0" license="MIT" replaced-by="chip2"/>
       <spec-component name="pay-chip" scope="feature" maturity="draft" origin="authored" wraps="chip"/>`,
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('warning');
  });

  it('errors on a reference that resolves to nothing — pointing at nothing should fail', () => {
    const f = findingsFor('<spec-component name="w" scope="feature" maturity="draft" origin="authored" wraps="gone"/>');
    expect(f[0]?.severity).toBe('error');
  });
});

describe('NFR-002 · provenance is recorded, never resolved', () => {
  it('reaches for no network — asserted over the rule module', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/schema/'));
    const src = readFileSync(join(root, 'packages/schema/src/rules/component-provenance.ts'), 'utf8');
    expect(src).not.toMatch(/fetch\(|node:https?|XMLHttpRequest|node:fs/);
  });

  it('produces byte-identical findings across 3 runs', () => {
    const runs = [1, 2, 3].map(() => JSON.stringify(findingsFor(VENDORED.replace('license="MIT"', ''))));
    expect(new Set(runs).size).toBe(1);
  });
});

describe('a document with no components', () => {
  it('is silent', () => {
    expect(findingsFor('<p>nothing</p>')).toEqual([]);
  });
});
