import { describe, expect, it } from 'vitest';
import { readComponents } from '../src/component.js';
import { parse } from '../src/parser.js';

/**
 * Reading components (spec 097, FR-001, design D-001/D-002).
 *
 * The point of these tests is what the reader does NOT do: it does not collapse
 * scope, maturity and origin into one state, and it does not resolve `wraps`.
 * Both are the design rather than laziness — the three properties are genuinely
 * independent, and provenance must exist in exactly one place.
 */

const doc = (body: string) => parse(`<!doctype html><html><body>${body}</body></html>`, 'visual/components.html');

describe('the three properties are independent', () => {
  it('reads a vendored component that is nonetheless feature-scoped and still in review', () => {
    // The combination a state machine would have made inexpressible.
    const [c] = readComponents(
      doc(
        '<spec-component name="chip" scope="feature" maturity="review" origin="vendored" origin-url="https://ui.example/chip" edition="1.4.0" license="MIT"/>',
      ),
    );
    expect(c).toMatchObject({ scope: 'feature', maturity: 'review', origin: 'vendored' });
  });

  it('reads an authored component promoted to project scope and accepted', () => {
    const [c] = readComponents(
      doc('<spec-component name="badge" scope="project" maturity="accepted" origin="authored"/>'),
    );
    expect(c).toMatchObject({ scope: 'project', maturity: 'accepted', origin: 'authored' });
  });

  it('reads a consumed component, which has no file in the project at all', () => {
    const [c] = readComponents(
      doc('<spec-component name="grid" scope="project" maturity="accepted" origin="consumed"/>'),
    );
    expect(c?.origin).toBe('consumed');
  });
});

describe('wraps is a reference, never a copy', () => {
  it('keeps the name and does not carry the wrapped provenance across', () => {
    const [, wrapper] = readComponents(
      doc(`<spec-component name="chip" scope="project" maturity="accepted" origin="vendored" origin-url="https://ui.example/chip" edition="1.4.0" license="MIT"/>
           <spec-component name="pay-chip" scope="feature" maturity="draft" origin="authored" wraps="chip"/>`),
    );
    expect(wrapper?.wraps).toBe('chip');
    // The whole point: one record of provenance exists, on the wrapped
    // component. The wrapper has none of its own to disagree with.
    expect(wrapper?.originUrl).toBeUndefined();
    expect(wrapper?.license).toBeUndefined();
  });
});

describe('used-by is evidence, not a trigger', () => {
  it('reads the features that use a component', () => {
    const [c] = readComponents(
      doc(
        '<spec-component name="badge" scope="feature" maturity="draft" origin="authored" used-by="001-convert 004-history"/>',
      ),
    );
    expect(c?.usedBy).toEqual(['001-convert', '004-history']);
  });

  it('is empty rather than undefined when nothing declares a use', () => {
    const [c] = readComponents(
      doc('<spec-component name="badge" scope="feature" maturity="draft" origin="authored"/>'),
    );
    expect(c?.usedBy).toEqual([]);
  });
});

describe('a document with no components', () => {
  it('returns nothing, and that is never a gap', () => {
    expect(readComponents(doc('<p>a project that consumes everything</p>'))).toEqual([]);
  });
});
