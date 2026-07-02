/**
 * The coverage partition (spec 029, plan D-004 / FR-005) — pure, no AI. Reads the
 * parent's requirement IDs via `extractSpecMetadata` and checks every FR/NFR/SC
 * lands in exactly one child: total (no gaps) and disjoint (no duplicates). This
 * is the mechanically-verifiable hard gate behind SC-001; the semantic critic
 * (FR-006) layers on top.
 */

import { extractSpecMetadata } from '@spectastic/schema';
import type { CandidateChild, CoverageAssignment, CoverageReport } from './types.js';

/** All parent requirement ids (FR/NFR/SC), in document order. */
export function parentRequirementIds(parentHtml: string): string[] {
  const md = extractSpecMetadata(parentHtml);
  return [...md.fr, ...md.nfr, ...md.sc].map((r) => r.id);
}

/** Build the requirement → child partition with gap/duplicate flags. */
export function buildCoverage(parentHtml: string, children: readonly CandidateChild[]): CoverageReport {
  const reqIds = parentRequirementIds(parentHtml);

  const claims = new Map<string, string[]>();
  for (const id of reqIds) claims.set(id, []);
  for (const c of children) {
    for (const id of c.assignedRequirementIds) {
      // A claim on an id the parent doesn't have is ignored here (not part of the
      // parent's partition); only real parent requirements are scored.
      if (claims.has(id)) claims.get(id)!.push(c.specId);
    }
  }

  const assignments: CoverageAssignment[] = reqIds.map((id) => {
    const cs = claims.get(id) ?? [];
    return {
      requirementId: id,
      childSpecId: cs.length === 1 ? cs[0]! : null,
      ...(cs.length > 1 ? { duplicatedIn: cs } : {}),
    };
  });

  const unassigned = reqIds.filter((id) => (claims.get(id) ?? []).length === 0);
  const duplicated = reqIds.filter((id) => (claims.get(id) ?? []).length > 1);

  return {
    assignments,
    unassigned,
    duplicated,
    isTotalAndDisjoint: unassigned.length === 0 && duplicated.length === 0,
  };
}
