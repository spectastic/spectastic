/**
 * Shared `<spec-visual>` vocabulary and reader (spec 093-design-visual-section).
 *
 * Cloned from `contract-shared.ts`, which holds the same two things for the
 * sibling element: the token vocabulary both packages need, and the single
 * pure parse of the element that every downstream consumer imports rather
 * than re-deriving. The filesystem-facing half — accumulating declarations
 * across a project's spec directories — lives in `@spectastic/core`, exactly
 * as `declaredInterfaceState` does for contracts, because this module must
 * stay importable by the pure-AST rule engine.
 */

import { findAll, getAttr, getLocation, parse } from './parser.js';

/**
 * The two recognised `shape=` tokens (093, FR-007).
 *
 * Deliberately binary: the spec's entity is "whether a feature has a visual
 * surface", and inventing a richer taxonomy here would pre-empt 095, which
 * owns the element family for screens and states. A later token is additive
 * and breaks nothing already authored.
 */
export const RECOGNISED_VISUAL_SHAPES = ['screens', 'none'] as const;
export type VisualShape = (typeof RECOGNISED_VISUAL_SHAPES)[number];

/** One `<spec-visual>` declaration, as read out of a design artifact. */
export interface VisualDeclaration {
  /** Raw `shape=` value — not narrowed to `VisualShape`, since a malformed
   *  document may carry an unrecognised or absent token. Validating that is
   *  the shape rule's job, not the reader's. */
  shape: string | undefined;
  /** Project-relative path of the project's token set. MAY resolve to a
   *  directory as well as a file (FR-005) — a token set split by mode is the
   *  normal case, which is where this diverges from a contract path. */
  tokens: string | undefined;
  /** The external base a local token set extends, when it holds only
   *  overrides (FR-005). Names a package, never a path — nothing resolves it. */
  tokensExternal: string | undefined;
  /** Project-relative path of the screens this feature touches. */
  screens: string | undefined;
  /** Where the design came from (FR-006). Provenance for a reader, never an
   *  authority: nothing reads it at validate time, and a project whose source
   *  is gone stays valid. */
  source: string | undefined;
  line: number;
  column: number;
}

/**
 * Read every `<spec-visual>` declaration out of a design artifact.
 * Pure — no fs, no clock, no environment: identical input, identical output.
 * Returns `[]` for a document with no declarations.
 */
export function readVisualDeclarations(html: string, file = 'design.html'): VisualDeclaration[] {
  const doc = parse(html, file);
  return findAll(doc.ast, 'spec-visual').map((el) => {
    const loc = getLocation(el);
    return {
      shape: getAttr(el, 'shape'),
      tokens: getAttr(el, 'tokens'),
      tokensExternal: getAttr(el, 'tokens-external'),
      screens: getAttr(el, 'screens'),
      source: getAttr(el, 'source'),
      line: loc.line,
      column: loc.column,
    };
  });
}
