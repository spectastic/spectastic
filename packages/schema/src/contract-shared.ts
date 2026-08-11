/**
 * Shared `<spec-contract>` vocabulary and reader.
 *
 *  - The shape vocabulary (spec 069-design-contract-section, D-005), moved
 *    here from `rules/contract-declaration-shape.ts` by 070-contract-sidecar-
 *    convention's Foundational phase (T-011) — "beside the existing shape
 *    tokens" is now literally true.
 *  - The compatibility-stance vocabulary (spec 077-event-schema-evolution,
 *    D-001), settled by the event compatibility vocabulary survey
 *    (docs/event-compatibility-considerations.html).
 *  - `readContractDeclarations()` (spec 070, D-001): the single parse of the
 *    069 element, imported by 071–074 rather than re-derived. Deliberately
 *    wider than 070 itself needs — it carries shape/direction/format even
 *    though 070's own resolve check only reads path (design §9 risk row) —
 *    so no sibling needs a shape change once this lands. Cloned from
 *    `slo-shared.ts`'s file and export shape per D-001.
 */

import type { Element } from './parser.js';
import { findAll, getAttr, getLocation, parse } from './parser.js';

/** The five recognised `shape=` tokens (069-design-contract-section, FR-004). */
export const RECOGNISED_SHAPES = ['request-response', 'rpc', 'graphql', 'event-driven', 'none'] as const;
export type ContractShape = (typeof RECOGNISED_SHAPES)[number];

/** The four registry compatibility directions (backward/forward/full/none). */
export const COMPATIBILITY_DIRECTIONS = ['backward', 'forward', 'full', 'none'] as const;
export type CompatibilityDirection = (typeof COMPATIBILITY_DIRECTIONS)[number];

/** The two transitivity scopes — against the latest version, or all retained history. */
export const COMPATIBILITY_SCOPES = ['latest', 'all'] as const;
export type CompatibilityScope = (typeof COMPATIBILITY_SCOPES)[number];

/** One `<spec-contract>` declaration, as read out of a design artifact. */
export interface ContractDeclaration {
  /** Raw `shape=` value — not narrowed to `ContractShape`, since a malformed
   *  document (shape rule not yet run, or intentionally lenient caller) may
   *  carry an unrecognised or absent token; validation is the shape rule's
   *  job, not the reader's. */
  shape: string | undefined;
  direction: string | undefined;
  path: string | undefined;
  format: string | undefined;
  compatibility: string | undefined;
  compatibilityScope: string | undefined;
  line: number;
  column: number;
  /** The nested `<spec-contract-view>`'s `lines=` (072-contract-embedded-view),
   *  when a view is present; `undefined` when the declaration carries no view
   *  at all (FR-007/FR-008 — a legal, common state). */
  viewLines: number | undefined;
  /** Whether the nested view is a truncated excerpt (`excerpt="true"`). */
  viewExcerpt: boolean;
  /** The view's decoded text content, whitespace preserved exactly — the raw
   *  projected bytes, for the drift check to compare against the real file.
   *  `undefined` when there is no view. */
  viewText: string | undefined;
  /** The contract's stable coordinate NAME (076-contract-export-handover,
   *  D-002) — what the contract *is*, independent of where its file sits.
   *  `undefined` when the declaration has no path to derive one from. */
  coordinateName: string | undefined;
}

/**
 * Derive a contract's stable coordinate name (076, D-002 / SC-002).
 *
 * An explicit `name=` on the declaration always wins. Absent one, the name
 * DEFAULTS to the path's basename without extension — a sensible identifier at
 * first authoring — and thereafter the author is expected to keep `name=` fixed
 * even if the file moves, which is what makes a coordinate survive a producer
 * reorganising its own repository.
 *
 * The default is a convenience for the common case, not the mechanism: the
 * mechanism is that the coordinate composer takes a name and never a path.
 */
export function contractCoordinateName(declared: string | undefined, path: string | undefined): string | undefined {
  if (declared !== undefined && declared.trim() !== '') return declared.trim();
  if (path === undefined) return undefined;
  const basename = path.split('/').pop() ?? path;
  const dot = basename.lastIndexOf('.');
  return dot > 0 ? basename.slice(0, dot) : basename;
}

/** Collect an element's text content verbatim — no whitespace collapsing,
 * since a contract's exact bytes (including newlines) are what the drift
 * check compares. parse5 already decodes HTML entities when giving a text
 * node's `.value`, so this returns the original, unescaped file content. */
function verbatimTextOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out;
}

/**
 * Read every `<spec-contract>` declaration out of a design artifact.
 * Pure — no fs, no clock, no environment (NFR-001): identical input,
 * identical output. Returns `[]` for a document with no declarations.
 */
export function readContractDeclarations(html: string, file = 'design.html'): ContractDeclaration[] {
  const doc = parse(html, file);
  return findAll(doc.ast, 'spec-contract').map((el) => {
    const loc = getLocation(el);
    // Scoped to this element's own subtree — findAll accepts an Element root,
    // not just the whole Document — so a sibling declaration's view is never
    // picked up by mistake (072-contract-embedded-view).
    const view = findAll(el, 'spec-contract-view')[0];
    return {
      shape: getAttr(el, 'shape'),
      direction: getAttr(el, 'direction'),
      path: getAttr(el, 'path'),
      format: getAttr(el, 'format'),
      compatibility: getAttr(el, 'compatibility'),
      compatibilityScope: getAttr(el, 'compatibility-scope'),
      line: loc.line,
      column: loc.column,
      viewLines: view ? Number(getAttr(view, 'lines')) : undefined,
      viewExcerpt: view ? getAttr(view, 'excerpt') === 'true' : false,
      viewText: view ? verbatimTextOf(view) : undefined,
      coordinateName: contractCoordinateName(getAttr(el, 'name'), getAttr(el, 'path')),
    };
  });
}
