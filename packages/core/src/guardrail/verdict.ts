import { matchesGlob, normalisePath } from './glob.js';
import type { GovernanceDecision, Verdict, Violation } from './types.js';

/**
 * The merge-stage verdict (spec 115-guardrail-verdict). Given the changed paths
 * and the project's decisions, produce a deterministic verdict per violation —
 * {decision-id, rule-id, reason, file:line, source→target} — from three
 * detector kinds:
 *
 *  - native CONTENT: a decision's forbidden `pattern` found in a changed file
 *    that is NOT in the rule's allowed zone (defaults to the decision's scope).
 *    The offending file is deliberately scanned even when it lies outside the
 *    governed scope — "no UPDATE positions OUTSIDE the adapter" is exactly a
 *    file elsewhere, so this iterates decisions × changed files, not
 *    `decisionsForPaths`.
 *  - native PATH: a changed file whose path matches a rule's `deny` glob.
 *  - ingested ENFORCER output (SARIF): a result whose rule-id matches a
 *    decision's `<spec-rule id>`, composed with that decision's reason.
 *
 * Pure and total: no fs (file content arrives via an injected `readFile`), no
 * clock (injected `now`), no network, and — the load-bearing guarantee — no
 * child process. Executing an enforcer's `run=` is a separate, guarded slice;
 * this kernel cannot run a foreign command by construction (NFR-001).
 */

export interface VerdictInput {
  changed: readonly string[];
  decisions: readonly GovernanceDecision[];
  now: Date;
  /** Reads a changed file's text for content detection; returns null if unreadable. */
  readFile: (path: string) => string | null;
  /** An ingested enforcer output (SARIF 2.1.0 core shape), if any. */
  sarif?: unknown;
  /**
   * The current project identity (spec 119, resolved via 067 at the CLI edge and
   * injected — the kernel reads no config). Used only for a resource-scoped
   * decision: an identity that owner-qualified-equals the decision's `owner`
   * gets the owner rule; anything else — including undefined or a bare,
   * unqualified value — is treated as a non-owner (fail safe).
   */
  currentProject?: string;
}

/** The 1-based line a pattern first matches in `text`, or undefined. */
function firstMatchLine(text: string, pattern: RegExp): number | undefined {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (pattern.test(lines[i]!)) return i + 1;
  return undefined;
}

/** Extract {ruleId, uri, line} from a SARIF document's results (spike-verified shape). */
export function readSarif(doc: unknown): { ruleId: string; uri?: string; line?: number }[] {
  const out: { ruleId: string; uri?: string; line?: number }[] = [];
  const runs = (doc as { runs?: unknown[] })?.runs;
  if (!Array.isArray(runs)) return out;
  for (const run of runs) {
    const results = (run as { results?: unknown[] })?.results;
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      const ruleId = (r as { ruleId?: unknown }).ruleId;
      if (typeof ruleId !== 'string') continue;
      const loc = (r as { locations?: { physicalLocation?: unknown }[] }).locations?.[0]?.physicalLocation as
        | { artifactLocation?: { uri?: unknown }; region?: { startLine?: unknown } }
        | undefined;
      const uri = typeof loc?.artifactLocation?.uri === 'string' ? loc.artifactLocation.uri : undefined;
      const line = typeof loc?.region?.startLine === 'number' ? loc.region.startLine : undefined;
      out.push({ ruleId, ...(uri !== undefined ? { uri } : {}), ...(line !== undefined ? { line } : {}) });
    }
  }
  return out;
}

export function verdictFor(input: VerdictInput): Verdict {
  const changed = [...new Set(input.changed.map(normalisePath))];
  const active = input.decisions.filter((d) => d.status === 'accepted');
  const violations: Violation[] = [];

  const push = (d: GovernanceDecision, ruleId: string, file: string, detector: Violation['detector'], extra: Partial<Violation> = {}): void => {
    violations.push({
      decisionId: d.id,
      specId: d.specId,
      ruleId,
      reason: d.reason ?? '',
      file,
      detector,
      ...extra,
    });
  };

  for (const d of active) {
    for (const rule of d.enforcement?.rules ?? []) {
      // Native content: forbidden pattern in a changed file outside the allowed zone.
      if (rule.pattern !== undefined) {
        // Owner-aware allowed zone (spec 119). A resource-scoped decision governs
        // a store owned by one project: the owner gets its `allowedIn` path (the
        // path rule); any other project — the defect being ownership, not layering
        // — gets an EMPTY zone, so every touch flags. A path-scoped decision
        // (no resource) keeps its existing zone unchanged (FR-006).
        let allowed: readonly string[];
        if (d.resource) {
          const isOwner = input.currentProject !== undefined && input.currentProject === d.resource.owner;
          allowed = isOwner && d.resource.allowedIn ? [d.resource.allowedIn] : [];
        } else {
          allowed = rule.allowedIn ? [rule.allowedIn] : d.paths;
        }
        const re = new RegExp(rule.pattern);
        for (const file of changed) {
          if (allowed.some((g) => matchesGlob(g, file))) continue; // inside the allowed zone
          const text = input.readFile(file);
          if (text === null) continue;
          const line = firstMatchLine(text, re);
          if (line !== undefined) {
            push(d, rule.id, file, 'content', { line, source: file, target: rule.pattern });
          }
        }
      }
      // Native path: a changed file matching a forbidden-location glob.
      if (rule.deny !== undefined) {
        for (const file of changed) {
          if (matchesGlob(rule.deny, file)) push(d, rule.id, file, 'path', { source: file, target: rule.deny });
        }
      }
    }
  }

  // Ingested enforcer output: match each SARIF result's rule-id to a decision's rule.
  if (input.sarif !== undefined) {
    const byRuleId = new Map<string, GovernanceDecision>();
    for (const d of active) for (const r of d.enforcement?.rules ?? []) byRuleId.set(r.id, d);
    for (const result of readSarif(input.sarif)) {
      const d = byRuleId.get(result.ruleId);
      if (!d) continue; // an enforcer rule that no decision governs — not our concern
      push(d, result.ruleId, result.uri ?? '(unknown)', 'enforcer', {
        ...(result.line !== undefined ? { line: result.line } : {}),
        source: result.uri ?? '(unknown)',
        target: result.ruleId,
      });
    }
  }

  // Deterministic order: file, then decision, then rule.
  violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      `${a.specId}/${a.decisionId}`.localeCompare(`${b.specId}/${b.decisionId}`) ||
      a.ruleId.localeCompare(b.ruleId),
  );

  return {
    at: input.now.toISOString(),
    scope: 'repo-local',
    decisionsEvaluated: active.length,
    changed: [...changed].sort(),
    violations,
  };
}

/** True when the verdict has any violation (the CLI's non-zero exit condition). */
export function hasViolation(v: Verdict): boolean {
  return v.violations.length > 0;
}
