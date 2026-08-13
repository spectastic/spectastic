/**
 * Copy as a design constraint (spec 103-content-budgets).
 *
 * Pure, and deliberately incurious about actual copy. Nothing here reads a
 * string a user would see — FR-003 makes that a requirement rather than a
 * limitation, so a later slice cannot add a partial check and present a green
 * result as enforcement.
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { BUDGET_ELEMENT, MESSAGE_SHAPE_ELEMENT, REFUSAL_ELEMENT } from './visual-vocabulary.js';

export interface CopyBudget {
  /** The class of element it constrains — "card title", not "this card title".
   *  Per class because the decision is about a kind of thing. */
  element: string | undefined;
  /** The number. A budget of "short" records an opinion and constrains nothing. */
  max: string | undefined;
  /** Characters or words. Required, because a bare number silently picks one
   *  and the two give different answers. */
  unit: string | undefined;
  /** When present, the budget applies to that source language only — which
   *  does not solve translation and stops the number claiming more than it
   *  means. */
  lang: string | undefined;
  line: number;
  column: number;
}

export interface Refusal {
  /** The string the product will not ship. */
  text: string | undefined;
  /** Where it is refused. Absent means everywhere, which is a choice rather
   *  than the default — "Error" is unacceptable to a user and fine in a log. */
  context: string | undefined;
  /** Content, never an attribute: a reason that can be an empty string is a
   *  presence check that passes on nothing. */
  reason: string;
  line: number;
  column: number;
}

export interface MessageShape {
  name: string | undefined;
  parts: string | undefined;
  line: number;
  column: number;
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

function textOf(el: Element): string {
  let out = '';
  const visit = (n: unknown): void => {
    const x = n as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (x.tagName === undefined && typeof x.value === 'string') out += x.value;
    if (x.childNodes) for (const c of x.childNodes) visit(c);
  };
  visit(el);
  return out.trim();
}

export function readCopyBudgets(doc: ParsedDocument | Document): CopyBudget[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, BUDGET_ELEMENT).map((el) => ({
    element: getAttr(el, 'element'),
    max: getAttr(el, 'max'),
    unit: getAttr(el, 'unit'),
    lang: getAttr(el, 'lang'),
    ...locOf(el),
  }));
}

export function readRefusals(doc: ParsedDocument | Document): Refusal[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, REFUSAL_ELEMENT).map((el) => ({
    text: getAttr(el, 'text'),
    context: getAttr(el, 'context'),
    reason: textOf(el),
    ...locOf(el),
  }));
}

export function readMessageShapes(doc: ParsedDocument | Document): MessageShape[] {
  const root = 'ast' in doc ? doc.ast : doc;
  return findAll(root, MESSAGE_SHAPE_ELEMENT).map((el) => ({
    name: getAttr(el, 'name'),
    parts: getAttr(el, 'parts'),
    ...locOf(el),
  }));
}
