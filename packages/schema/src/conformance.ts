/**
 * Which elements carry conformance (spec 108-success-criteria, T-010, D-005).
 *
 * Two of the four readers this document must agree with are TypeScript and
 * can import this — `verify.ts`'s SC-trace extraction and
 * `verify-view-stale.ts`'s drift check. The other two live in `assets/spec.js`,
 * plain browser JavaScript belonging to no package, so they carry their own
 * copy of this same list rather than importing it; a parity test (T-202) is
 * what keeps the two definitions from silently diverging.
 *
 * `<spec-criterion>` is deliberately a distinct element from
 * `<spec-requirement>` (FR-001) — an obligation on the system is not a
 * measured observation about the world — but both are conformance-bearing:
 * both carry a stable id a reader traces, and both belong in the conformance
 * index and the size gauge. This list is where that shared fact lives.
 */

/** Every element whose `id=` participates in conformance tracing — the
 *  verify trace, the drift check, the conformance index, and the size
 *  gauge's requirement count. */
export const CONFORMANCE_ELEMENTS = ['spec-requirement', 'spec-criterion'] as const;

export type ConformanceElement = (typeof CONFORMANCE_ELEMENTS)[number];

/** Whether `tagName` is one of the conformance-bearing elements above. */
export function isConformanceElement(tagName: string): tagName is ConformanceElement {
  return (CONFORMANCE_ELEMENTS as readonly string[]).includes(tagName);
}
