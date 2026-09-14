/**
 * Kernel for `spectastic verdict` (spec 115-guardrail-verdict). Given the
 * changed paths, load the project's decisions, pre-read the changed files, run
 * the pure verdict, and render the persisted artifact. Deterministic and
 * AI-free; the clock is injected. Reads files via `ctx.fs`, never a foreign
 * command — executing an enforcer's `run=` is a separate guarded slice.
 */

import { normalisePath } from '../guardrail/glob.js';
import { hasViolation, verdictFor } from '../guardrail/verdict.js';
import { renderVerdict } from '../guardrail/verdict-log.js';
import type { GovernanceDecision, Verdict } from '../guardrail/types.js';
import type { KernelContext } from '../types.js';
import { loadDecisions } from './adrs.js';

export type { Verdict, Violation, ExplainedViolation, GovernanceDecision } from '../guardrail/types.js';
export { verdictFor, hasViolation, readSarif } from '../guardrail/verdict.js';
export { renderVerdict } from '../guardrail/verdict-log.js';
export { shifuQuestions } from '../guardrail/shifu.js';
export { explainViolations, renderExplanations } from '../guardrail/explain.js';
export { loadDecisions } from './adrs.js';

export interface VerdictCommandInput {
  changed: string[];
  now: Date;
  /** An ingested enforcer output (parsed SARIF), if any. */
  sarif?: unknown;
  /** Pre-loaded decisions; when omitted the kernel reads specs/<id>/design.html. */
  decisions?: GovernanceDecision[];
  /** The current project identity (spec 119), resolved at the edge and injected
   *  so the pure kernel reads no config; used for a resource-scoped decision's
   *  owner comparison. */
  currentProject?: string;
}

export interface VerdictCommandResult {
  verdict: Verdict;
  verdictText: string;
  hasViolation: boolean;
  /** The pre-read changed-file contents, so `--explain` reuses them (no re-read). */
  contents: Map<string, string>;
}

export async function verdictCommand(input: VerdictCommandInput, ctx: KernelContext): Promise<VerdictCommandResult> {
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;
  const decisions = input.decisions ?? (await loadDecisions(ctx));

  // Pre-read the changed files (the pure verdict takes a sync reader).
  const contents = new Map<string, string>();
  for (const raw of input.changed) {
    const path = normalisePath(raw);
    try {
      contents.set(path, await fs.readFile(path, 'utf8'));
    } catch {
      // Unreadable/deleted changed file — content detection skips it.
    }
  }

  const verdict = verdictFor({
    changed: input.changed,
    decisions,
    now: input.now,
    readFile: (p) => contents.get(normalisePath(p)) ?? null,
    ...(input.sarif !== undefined ? { sarif: input.sarif } : {}),
    ...(input.currentProject !== undefined ? { currentProject: input.currentProject } : {}),
  });

  return { verdict, verdictText: renderVerdict(verdict), hasViolation: hasViolation(verdict), contents };
}
