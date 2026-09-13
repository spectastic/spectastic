import { matchesGlob, normalisePath } from './glob.js';
import type { GovernanceDecision, RetrievalMatch } from './types.js';

/**
 * Deterministic, scoped decision retrieval (spec 112 Slice 2,
 * `TBD-guardrail-retrieval` / rubric item 2). Given a set of code paths and the
 * project's decisions, return the ACTIVE (accepted) decisions whose scope globs
 * match any of the paths — the decisions that govern this change.
 *
 * Deterministic by construction: pure glob matching, no clock, no fs, no
 * network; the result is sorted by (specId, decision id) so the same inputs
 * always produce the same ordering. Only `accepted` decisions govern — a
 * `proposed` decision is not yet binding, and `superseded`/`retired` are
 * inactive (a superseding decision's predecessor is already excluded here,
 * which is why the Slice-1 overlap check need only consider active pairs).
 *
 * "Precedence" in the brief is a reported concern, not a silent pick: two active
 * decisions that both match with no supersede link are surfaced by
 * `decision-well-formed` (Slice 1). Retrieval returns them both, ordered
 * stably, so a caller sees the full governing set.
 */
export function decisionsForPaths(
  paths: readonly string[],
  decisions: readonly GovernanceDecision[],
): RetrievalMatch[] {
  const queryPaths = [...new Set(paths.map(normalisePath))];
  const matches: RetrievalMatch[] = [];

  for (const decision of decisions) {
    if (decision.status !== 'accepted') continue;
    if (decision.paths.length === 0) continue;
    const matchedPaths = queryPaths.filter((p) => decision.paths.some((glob) => matchesGlob(glob, p)));
    if (matchedPaths.length === 0) continue;
    matches.push({ decision, matchedPaths: matchedPaths.sort() });
  }

  matches.sort((a, b) => {
    const s = a.decision.specId.localeCompare(b.decision.specId);
    return s !== 0 ? s : a.decision.id.localeCompare(b.decision.id);
  });
  return matches;
}
