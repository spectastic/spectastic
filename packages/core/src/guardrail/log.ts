import { decisionResourceUri } from '@spectastic/schema/project';
import type { RetrievalLog, RetrievalMatch } from './types.js';

/**
 * Render the reproducible retrieval log (spec 112 Slice 2 / rubric item 2:
 * retrieval is "logged" and the merge verdict must "reconstruct entirely from
 * artefacts on disk"). Pure given an injected clock (`now`) — the enforce/policy
 * precedent for keeping a date-dependent result deterministic in fixtures.
 *
 * The log is the diffable record the plan-time and merge-time retrievals are
 * compared against (design brief §3.3): same query paths → same governing set.
 */
export function buildRetrievalLog(
  project: string,
  paths: readonly string[],
  matches: readonly RetrievalMatch[],
  now: Date,
): RetrievalLog {
  return {
    at: now.toISOString(),
    paths: [...paths].sort(),
    governing: matches.map((m) => ({
      coordinate: decisionResourceUri(project, m.decision.specId, m.decision.id),
      specId: m.decision.specId,
      id: m.decision.id,
      matchedPaths: m.matchedPaths,
    })),
  };
}

/** Serialise the log deterministically (stable key order, trailing newline). */
export function renderRetrievalLog(log: RetrievalLog): string {
  return `${JSON.stringify(log, null, 2)}\n`;
}
