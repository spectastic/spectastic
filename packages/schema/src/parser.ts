import { parse as parse5Parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import type { ParsedDocument } from './types.js';

export type Document = DefaultTreeAdapterTypes.Document;
export type Element = DefaultTreeAdapterTypes.Element;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;

/**
 * Parse a spec-html string into a ParsedDocument. Source-location info
 * is enabled so every Element carries `sourceCodeLocation` for findings.
 */
export function parse(html: string, file: string): ParsedDocument {
  const ast = parse5Parse(html, { sourceCodeLocationInfo: true });
  const status = readSpecStatus(ast);
  return { html, file, ast, ...(status !== undefined ? { status } : {}) };
}

/**
 * Walk every Element in the tree, depth-first, in source order.
 * Non-element nodes (text, comment, doctype) are skipped.
 */
export function walk(root: Document | Element, visitor: (el: Element) => void): void {
  const visit = (node: ChildNode | Document): void => {
    if (isElement(node)) visitor(node);
    if ('childNodes' in node && node.childNodes) {
      for (const child of node.childNodes) visit(child);
    }
  };
  visit(root);
}

/** Find all elements whose tagName matches. */
export function findAll(root: Document | Element, tagName: string): Element[] {
  const matches: Element[] = [];
  walk(root, (el) => {
    if (el.tagName === tagName) matches.push(el);
  });
  return matches;
}

/** Read an attribute value if present. */
export function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/** Whether the element declares the given attribute (with any value, including empty). */
export function hasAttr(el: Element, name: string): boolean {
  return el.attrs.some((a) => a.name === name);
}

/**
 * Get the 1-indexed line and column for an element. Falls back to (1,1)
 * if parse5 didn't attach location info to this node (shouldn't happen
 * with sourceCodeLocationInfo: true, but defensive).
 */
export function getLocation(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  if (loc) return { line: loc.startLine, column: loc.startCol };
  return { line: 1, column: 1 };
}

/** True if a parse5 ChildNode is an element (has tagName, attrs). */
function isElement(node: ChildNode | Document): node is Element {
  return 'tagName' in node && typeof node.tagName === 'string';
}

/** Read the document's `<spec-status value="...">` if present. */
function readSpecStatus(root: Document): string | undefined {
  const els = findAll(root, 'spec-status');
  const first = els[0];
  if (!first) return undefined;
  return getAttr(first, 'value');
}
