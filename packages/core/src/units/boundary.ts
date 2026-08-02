/**
 * The boundary map (spec 081-boundary-map-detection).
 *
 * A project's declared arrangement of its own units — read from the linter
 * config it already maintains, never authored here. Informational by
 * construction (FR-003): nothing gates on it, because P-14 and 075 both record
 * that this judgment is review-caught rather than machine-enforceable.
 */

/** Which declaration produced a map, kept for provenance. */
export type BoundarySource = 'nx' | 'import-linter';

/**
 * Named units, and the directed pairs permitted between them (D-002).
 *
 * The common denominator of two formats that look incompatible: Nx gives a
 * tag-constraint graph, import-linter an ordered layer list. Expanding the
 * ordering — each layer may depend on every layer below it — is lossless,
 * because the ordering *was* the constraint.
 *
 * A map may name units and permit nothing between them. That is a map with no
 * constraints, and it is not the same as having no map.
 */
export interface BoundaryMap {
  source: BoundarySource;
  /** Every unit the project names — its tags, or its layers. */
  units: string[];
  /** `from → to` pairs the project permits. */
  permitted: { from: string; to: string }[];
}

/**
 * The three states, and conflating any two of them loses what this slice
 * carries:
 *
 *   mapped            — the project names its rings.
 *   none              — the project declares nothing about them.
 *   unmapped-by-form  — the project declares boundaries, but only as forbidden
 *                       edges, which cannot enumerate destinations and are
 *                       silent about one that does not exist yet.
 *
 * The third is the one a reader most needs distinguished: it is the case where
 * a project believes it has declared its architecture and the tool cannot use
 * what it declared.
 */
export type BoundaryResult =
  | { kind: 'mapped'; map: BoundaryMap }
  | { kind: 'none' }
  | { kind: 'unmapped-by-form'; detected: string; reason: string };

/**
 * Expand an ordered layer list into permitted pairs.
 *
 * `[high, medium, low]` means high may depend on medium and low, and medium on
 * low — "lower layers are not allowed to depend on higher layers". Pure, and
 * exported because it is the load-bearing half of D-002.
 */
export function expandLayerOrder(layers: readonly string[]): { from: string; to: string }[] {
  const pairs: { from: string; to: string }[] = [];
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const from = layers[i];
      const to = layers[j];
      if (from !== undefined && to !== undefined) pairs.push({ from, to });
    }
  }
  return pairs;
}
