/**
 * Reading component declarations (spec 097-visual-component-lifecycle).
 *
 * The three properties — scope, maturity, origin — are read INDEPENDENTLY and
 * deliberately not collapsed into a single state. A vendored component can be
 * local or shared, an authored one either, and maturity varies across all of
 * them; a state machine over the combination would make most real cases
 * inexpressible.
 *
 * `wraps` is kept as a reference rather than resolved here. One record of
 * origin, version and licence exists — on the component being wrapped — and the
 * wrapper reads through it, so the two can never disagree (design D-001).
 *
 * Pure: no filesystem, no clock, no network. Provenance is recorded, never
 * fetched (design D-005).
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { COMPONENT_ELEMENT } from './visual-vocabulary.js';

export interface ComponentDeclaration {
  name: string | undefined;
  scope: string | undefined;
  maturity: string | undefined;
  origin: string | undefined;
  /** Provenance, present only on a vendored component. */
  originUrl: string | undefined;
  edition: string | undefined;
  license: string | undefined;
  /** The component this one wraps, as a NAME — never resolved here. */
  wraps: string | undefined;
  /** Spec ids that use this component. Evidence a person reads, not a fact
   *  anything computes from — it is hand-maintained and will go stale. */
  usedBy: string[];
  /** Named replacement for a deprecated component. */
  replacedBy: string | undefined;
  line: number;
  column: number;
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

export function readComponents(doc: ParsedDocument | Document): ComponentDeclaration[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, COMPONENT_ELEMENT).map((el) => ({
    name: getAttr(el, 'name'),
    scope: getAttr(el, 'scope'),
    maturity: getAttr(el, 'maturity'),
    origin: getAttr(el, 'origin'),
    originUrl: getAttr(el, 'origin-url'),
    edition: getAttr(el, 'edition'),
    license: getAttr(el, 'license'),
    wraps: getAttr(el, 'wraps'),
    usedBy: (getAttr(el, 'used-by') ?? '').split(/\s+/).filter((s) => s !== ''),
    replacedBy: getAttr(el, 'replaced-by'),
    ...locOf(el),
  }));
}
