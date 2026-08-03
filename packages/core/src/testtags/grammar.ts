/**
 * The test-tag grammar (spec 084, FR-001).
 *
 * A tag is embedded in the test's own title, because that is the one place both
 * installed runners can filter on today: Playwright reads `@`-prefixed title
 * tokens natively, and Vitest 2.1.9 filters titles with `-t`. Runner-native tag
 * options would be structurally nicer and are unavailable until Vitest 4.1.
 *
 *   @084          this test belongs to spec 084
 *   @084:FR-001   …and closes FR-001 of that spec
 *
 * Qualification is not decoration. Requirement ids are unique only inside their
 * own document, so a bare `@FR-001` would collide across every spec in the
 * estate; the grammar rejects it rather than guessing an owner.
 *
 * One property is deliberate: a qualified tag *begins with* the spec tag, so a
 * plain substring filter on `@084` selects the qualified tests too. The common
 * case therefore needs no boolean expression — which is exactly what the
 * installed runner cannot do.
 */

/** A parsed tag: the spec it belongs to, and optionally the id it closes. */
export interface TestTag {
  /** The spec's leading number, as written — e.g. "084". */
  spec: string;
  /** The requirement or task id this test closes, if the tag was qualified. */
  id?: string;
}

// A spec number is 3+ digits; an id is the estate's FR-/NFR-/SC-/T- shape.
const TAG_RE = /@(\d{3,})(?::((?:FR|NFR|SC|T)-\d+))?\b/g;

/**
 * Every tag in a piece of text, in the order encountered.
 *
 * Deliberately scans rather than anchors: a tag lives inside a sentence
 * ("renders the card @084:FR-003"), not as the whole title.
 */
export function parseTags(text: string): TestTag[] {
  const out: TestTag[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const spec = m[1];
    if (spec === undefined) continue;
    const id = m[2];
    out.push(id === undefined ? { spec } : { spec, id });
  }
  return out;
}

/** Render a tag back to its canonical written form. */
export function formatTag(tag: TestTag): string {
  return tag.id === undefined ? `@${tag.spec}` : `@${tag.spec}:${tag.id}`;
}

/**
 * The filter a runner should be given to select a spec's tests.
 *
 * Returns the bare spec tag on purpose: substring-matched by both runners, it
 * catches the qualified tags too.
 */
export function selectorFor(spec: string): string {
  return `@${spec}`;
}

/** Stable ordering — by spec, then by id, with the unqualified tag first. */
export function compareTags(a: TestTag, b: TestTag): number {
  if (a.spec !== b.spec) return a.spec < b.spec ? -1 : 1;
  if (a.id === b.id) return 0;
  if (a.id === undefined) return -1;
  if (b.id === undefined) return 1;
  return a.id < b.id ? -1 : 1;
}
