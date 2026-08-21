/**
 * Label slugging and collision detection (spec 106-visual-render, T-111,
 * FR-006/FR-007, SC-005).
 *
 * FR-006 names a capture from its artboard's declared label "reduced to a
 * name the filesystem accepts". `slugLabel` is that reduction: lowercase,
 * the `·` separator (and any spaces around it) collapsed to one hyphen,
 * spaces within a segment collapsed the same way, and characters a
 * filesystem forbids stripped outright rather than swapped for a hyphen —
 * swapping would turn `bad/name` and `bad-name` into the same slug for a
 * reason nobody chose.
 *
 * FR-007 is the companion refusal: two artboards whose labels reduce to the
 * same slug must be REPORTED, never let one silently overwrite the other's
 * capture file. `detectCollisions` is the mechanism T-111's caller uses to
 * decide whether a run's requested count and its written-file count are
 * allowed to differ (SC-005: exactly 1 fewer per collision, and the
 * collision reported — never a silent write-then-overwrite).
 */

/** Characters a filesystem forbids in a path segment (Windows' reserved set
 *  is the strictest of the common platforms, so stripping it covers macOS
 *  and Linux too). */
const FORBIDDEN_CHARS = /[/\\:*?"<>|]/g;

/** Reduce a declared label to a filesystem-safe slug. */
export function slugLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(FORBIDDEN_CHARS, '')
      // The `·` separator, with any surrounding whitespace, collapses to one
      // hyphen before the generic whitespace pass runs — otherwise the spaces
      // either side of it would each collapse to their own hyphen first.
      .replace(/\s*·\s*/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
  );
}

/**
 * Group original labels by their slug, keeping only slugs shared by more
 * than one label. A slug unique to one label is absent from the returned
 * Map entirely — the caller only cares about the labels that collide.
 */
export function detectCollisions(labels: string[]): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();
  for (const label of labels) {
    const slug = slugLabel(label);
    const bucket = bySlug.get(slug) ?? [];
    bucket.push(label);
    bySlug.set(slug, bucket);
  }
  for (const [slug, bucket] of bySlug) {
    if (bucket.length < 2) bySlug.delete(slug);
  }
  return bySlug;
}
