/**
 * Reading the token set's version (spec 098-token-set-versioning).
 *
 * Contains NO comparison between two versions, and must not learn one. The
 * version answers "which rules was this built under", not "which is newer" —
 * NFR-001 caps orderings at zero, and a test asserts the absence at source
 * level rather than merely checking that none is called.
 *
 * That is not an oversight to fix later. Every versioning mechanism in this
 * project compares by equality and none orders: the corpus edition, the
 * contract baselines, the principles from-version. Equality is decidable
 * without agreeing a format contract; a mechanism claiming to know which
 * version is later must then enforce that claim forever.
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { RELEASE_ELEMENT, TOKEN_SET_ELEMENT } from './visual-vocabulary.js';

export interface Release {
  from: string | undefined;
  to: string | undefined;
  /** One of the three bump tiers. The producer's claim, never verified. */
  changeClass: string | undefined;
  /** Whether this release removes a token, which must be classified highest. */
  removes: string | undefined;
  /** Whether it deprecates one — a token must not be removed in the same release. */
  deprecates: string | undefined;
  line: number;
  column: number;
}

export interface TokenSet {
  version: string | undefined;
  /** The version this one binds forward from. Work accepted under an earlier
   *  one stays conformant to it — the clause that makes bumping affordable. */
  bindsFrom: string | undefined;
  /** An external base's version, recorded separately rather than folded in:
   *  the base moves on somebody else's schedule (FR-010). */
  externalBase: string | undefined;
  /** The bump policy, as the element's own prose. A policy living elsewhere is
   *  one nobody reads at the moment of bumping (FR-001). */
  policy: string;
  releases: Release[];
  line: number;
  column: number;
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

/** The element's own prose, excluding nested releases. */
function policyOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === RELEASE_ELEMENT) return;
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.trim();
}

export function readTokenSet(doc: ParsedDocument | Document): TokenSet | null {
  const root = 'ast' in doc ? doc.ast : doc;
  const el = findAll(root, TOKEN_SET_ELEMENT)[0];
  if (el === undefined) return null;

  const releases: Release[] = findAll(el, RELEASE_ELEMENT).map((r) => ({
    from: getAttr(r, 'from'),
    to: getAttr(r, 'to'),
    changeClass: getAttr(r, 'class'),
    removes: getAttr(r, 'removes'),
    deprecates: getAttr(r, 'deprecates'),
    ...locOf(r),
  }));

  return {
    version: getAttr(el, 'version'),
    bindsFrom: getAttr(el, 'binds-from'),
    externalBase: getAttr(el, 'external-base'),
    policy: policyOf(el),
    releases,
    ...locOf(el),
  };
}
