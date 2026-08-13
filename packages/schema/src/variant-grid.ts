/**
 * Reading the variant grid (spec 096-visual-variant-grid, FR-001, design D-003).
 *
 * Deliberately ORDER-PRESERVING. Document order *is* the resolution order, so
 * this must never sort, key or otherwise reorder what it returns — a test
 * asserts it, because "returns them in the order it found them" is a contract
 * here rather than an implementation detail.
 *
 * An `order=` attribute would have been explicit too, and would have created a
 * second ordering able to disagree with the first. P-1 already guarantees
 * source order is reading order, so this reuses an invariant the project holds
 * instead of adding one to keep consistent.
 *
 * Pure: no filesystem, no clock, no network. NFR-002 forbids all three, and the
 * module takes no port through which any of them could be reached.
 */

import type { Document, Element } from './parser.js';
import { findAll, getAttr, hasAttr } from './parser.js';
import type { ParsedDocument } from './types.js';
import { AXIS_ELEMENT, BASELINE_ELEMENT, CONTEXT_ELEMENT, GRID_ELEMENT, SAME_ELEMENT } from './visual-vocabulary.js';

export interface Baseline {
  designed: string | undefined;
  /** `none` is a legal value meaning never verified — an ABSENT attribute is
   *  the error. FR-005 is explicit that the gap must be visible, not missing. */
  verified: string | undefined;
  line: number;
  column: number;
}

export interface VariantContext {
  name: string | undefined;
  declined: boolean;
  /** A decline's reason is content rather than an attribute, so it cannot be an
   *  empty string that satisfies a presence check. */
  reason: string;
  baseline: Baseline | undefined;
  line: number;
  column: number;
}

export interface VariantAxis {
  name: string | undefined;
  default: string | undefined;
  selects: string | undefined;
  contexts: VariantContext[];
  line: number;
  column: number;
}

export interface SameCombination {
  /** axis name → context name, as authored. */
  axes: Record<string, string>;
  raw: string;
  line: number;
  column: number;
}

export interface VariantGrid {
  axes: VariantAxis[];
  same: SameCombination[];
}

/** Collect an element's own text, excluding nested declarations. */
function reasonOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === BASELINE_ELEMENT) return;
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.trim();
}

function locOf(el: Element): { line: number; column: number } {
  const loc = el.sourceCodeLocation;
  return loc ? { line: loc.startLine, column: loc.startCol } : { line: 1, column: 1 };
}

/**
 * Parse a space-separated `axis=context` list into a map — the grammar
 * `<spec-same axes="platform=tv mode=dark">` uses, and now also the grammar a
 * design's `<spec-visual contexts=…>` coverage claim uses (093 FR-012, applied
 * change 2026-08-13-declare-the-variant-grid).
 *
 * Exported so the coverage check can borrow the GRAMMAR without borrowing
 * `variantSameResolvesRule`'s resolution, which it cannot: that rule is
 * per-file and returns immediately on a document carrying no grid element, and
 * a design never carries one. Reading the grid a design points at is
 * cross-file work and lives in the kernel.
 *
 * Never throws on a malformed pair — the caller reports it; the reader does not.
 */
export function parseAxisContextPairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.trim().split(/\s+/)) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue; // malformed; the rule reports it, the reader does not throw
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

export function readVariantGrid(doc: ParsedDocument | Document): VariantGrid {
  const root = 'ast' in doc ? doc.ast : doc;

  // Scoped to the grid when one is declared, so a stray axis outside it is the
  // shape rule's problem rather than silently joining the grid.
  const grids = findAll(root, GRID_ELEMENT);
  const scope = grids[0] ?? root;

  const axes: VariantAxis[] = findAll(scope, AXIS_ELEMENT).map((axisEl) => {
    const contexts: VariantContext[] = findAll(axisEl, CONTEXT_ELEMENT).map((ctxEl) => {
      const baselineEl = findAll(ctxEl, BASELINE_ELEMENT)[0];
      return {
        name: getAttr(ctxEl, 'name'),
        declined: hasAttr(ctxEl, 'declined'),
        reason: reasonOf(ctxEl),
        baseline: baselineEl
          ? {
              designed: getAttr(baselineEl, 'designed'),
              verified: getAttr(baselineEl, 'verified'),
              ...locOf(baselineEl),
            }
          : undefined,
        ...locOf(ctxEl),
      };
    });
    return {
      name: getAttr(axisEl, 'name'),
      default: getAttr(axisEl, 'default'),
      selects: getAttr(axisEl, 'selects'),
      contexts,
      ...locOf(axisEl),
    };
  });

  const same: SameCombination[] = findAll(scope, SAME_ELEMENT).map((el) => {
    const raw = getAttr(el, 'axes') ?? '';
    return { axes: parseAxisContextPairs(raw), raw, ...locOf(el) };
  });

  return { axes, same };
}
