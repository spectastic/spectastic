/**
 * Reconstitute foreign decisions from a validated index for the verdict
 * (spec 122-decision-index-federation, D-006). Only resource-scoped
 * decisions participate — a foreign path or module glob means nothing in the
 * consumer's tree (spec FR-006). Every rule's pattern is length-capped and
 * compile-checked here, before the kernel's one `RegExp` compile site
 * (`guardrail/verdict.ts`), so a hostile or careless owner index cannot reach
 * it — a rejected rule is counted on its source and never run (spec FR-009).
 *
 * Scaffold only (T-001) — implemented in T-310 against the failing test in T-300.
 */

import type { EnforcementRule, GovernanceDecision, ResourceScope } from '../guardrail/types.js';
import type { IndexedDecision, IndexedRule } from './index.js';

/** The longest a foreign rule's pattern may be before it is refused outright (spec FR-009). */
export const MAX_FOREIGN_PATTERN_LENGTH = 1024;

export interface MergeSourceResult {
  decisions: GovernanceDecision[];
  evaluated: number;
  ignored: number;
  refused: number;
}

/** True when a foreign rule's `pattern` passes the FR-009 gate: at most
 *  `MAX_FOREIGN_PATTERN_LENGTH` characters and compiles under `RegExp`. A
 *  rule with no `pattern` (a `deny`-only glob) is never subject to this gate —
 *  it is not compiled here or at the kernel's own compile site. */
function patternPasses(pattern: string): boolean {
  if (pattern.length > MAX_FOREIGN_PATTERN_LENGTH) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** Strip a rule down to what `verdictFor` reads (`run` was already stripped at export). */
function toRule(rule: IndexedRule): EnforcementRule {
  const out: EnforcementRule = { tool: rule.tool, id: rule.id };
  if (rule.pattern !== undefined) out.pattern = rule.pattern;
  if (rule.deny !== undefined) out.deny = rule.deny;
  if (rule.allowedIn !== undefined) out.allowedIn = rule.allowedIn;
  return out;
}

/** Filter one decision's rules through the FR-009 gate, returning the
 *  survivors plus how many were dropped. */
function filterRules(rules: readonly IndexedRule[]): { rules: EnforcementRule[]; refused: number } {
  const kept: EnforcementRule[] = [];
  let refused = 0;
  for (const rule of rules) {
    if (rule.pattern !== undefined && !patternPasses(rule.pattern)) {
      refused += 1;
      continue;
    }
    kept.push(toRule(rule));
  }
  return { rules: kept, refused };
}

/** Reconstitute one resource-scoped indexed decision into the
 *  `GovernanceDecision` shape `verdictFor` reads. `resource` is passed
 *  separately, already narrowed by the caller. */
function toGovernanceDecision(d: IndexedDecision, resource: ResourceScope, rules: EnforcementRule[]): GovernanceDecision {
  const gov: GovernanceDecision = {
    id: d.id,
    specId: d.specId,
    status: d.status,
    paths: d.paths,
    modules: d.modules,
    resource: { ...resource },
  };
  if (d.posture !== undefined) gov.posture = d.posture;
  if (d.supersedes !== undefined) gov.supersedes = d.supersedes;
  if (d.reviewBy !== undefined) gov.reviewBy = d.reviewBy;
  if (d.reason !== undefined) gov.reason = d.reason;
  if (d.title !== undefined) gov.title = d.title;
  if (d.enforcement !== undefined) gov.enforcement = { rules };
  return gov;
}

/** Reconstitute one source's indexed decisions into `GovernanceDecision`s the
 *  verdict can evaluate: only those carrying `resource` are kept (others are
 *  `ignored`); a rule whose pattern exceeds the cap or fails to compile is
 *  dropped from its decision and counted as `refused` (spec FR-006/FR-009,
 *  D-006) — the gate runs here, before the kernel's one `RegExp` compile
 *  site (`guardrail/verdict.ts`). Local rules are never touched; this
 *  function only ever sees rules that already crossed the export boundary. */
export function mergeForeignDecisions(decisions: readonly IndexedDecision[]): MergeSourceResult {
  const out: GovernanceDecision[] = [];
  let evaluated = 0;
  let ignored = 0;
  let refused = 0;

  for (const d of decisions) {
    if (d.resource === undefined) {
      ignored += 1;
      continue;
    }
    evaluated += 1;
    const filtered = filterRules(d.enforcement?.rules ?? []);
    refused += filtered.refused;
    out.push(toGovernanceDecision(d, d.resource, filtered.rules));
  }

  return { decisions: out, evaluated, ignored, refused };
}
