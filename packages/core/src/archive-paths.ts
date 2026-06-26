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
