/**
 * Shared archive path-rewrite for artifacts that move one directory level
 * deeper on archive — `changes/<slug>/` → `changes/archive/<slug>/` (apply),
 * or `explorations/<id>/` → `explorations/archive/<id>/` (graduation).
 *
 * Every `../`-relative `href`/`src` needs one more `../` to resolve from the new
 * depth: a target reached by k `../` from the old dir sits k+1 up from the
 * (one-level-deeper) new dir, so prepending a single `../` is correct for every
 * relative link.
 *
 * Lifted from `commands/apply.ts` in 023-explore-graduation (plan D-005) so the
 * apply kernel and the graduation transaction share one implementation, tested
 * once.
 */
export function deepenArchivePaths(html: string): string {
  return html.replaceAll(/((?:href|src)=")(\.\.\/)/g, '$1../$2');
}

/**
 * Re-base an embedded `<spec-requirement>`'s relative links from proposal depth to
 * live-spec depth when the apply kernel folds an `added`/`modified` delta's post-state
 * into `spec.html` (triage T-020; spec 000 REQ-CHANGE-008).
 *
 * A proposal lives at `specs/<id>/changes/<date>-<slug>/proposal.html` — 4 directory
 * levels deep, so a `../`-relative link needs 4 `../` to reach the repo root. The live
 * spec lives at `specs/<id>/spec.html` — 2 levels deep, needing only 2 `../` for the
 * same root. The difference is always exactly 2, regardless of what the link ultimately
 * points at (a root file, a sibling spec, or a sibling artifact in the same spec's own
 * directory) — so re-basing is simply "strip the first two `../` segments from every
 * `href`/`src` that has them," floored at zero. A same-document `#ID` anchor carries no
 * `../` at all, so it never matches and passes through untouched — it's depth-independent
 * by construction, which is exactly why proposal authors are expected to write a same-spec
 * cross-reference that way in the first place.
 *
 * This is the mirror of `deepenArchivePaths` above (which adds exactly one `../` for the
 * one-level-deeper archive move); this removes exactly two, for the four-levels-deep
 * proposal folding into the two-levels-deep live spec.
 */
export function shallowProposalPaths(html: string): string {
  return html.replace(/((?:href|src)=")((?:\.\.\/)+)/g, (_match, attr: string, dots: string) => {
    const depth = dots.length / 3; // each "../" segment is exactly 3 characters
    const newDepth = Math.max(0, depth - 2);
    return `${attr}${'../'.repeat(newDepth)}`;
  });
}
