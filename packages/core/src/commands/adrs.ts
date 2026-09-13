/**
 * Kernel for `spectastic adrs --for <paths…>` (spec 112-guardrail-decision-record
 * → Slice 2, `TBD-guardrail-retrieval`; design brief §3.3). Given a set of code
 * paths, return the ACTIVE governance decisions that govern them, in a stable
 * precedence order, and a reproducible retrieval log.
 *
 * Deterministic and AI-free — no `createAIProvider()`, no clock of its own: the
 * clock is injected (`input.now`), so a fixture pins it and the same query
 * always yields the same log (rubric items 2/5/6: retrieval is logged and the
 * verdict reconstructs from disk). The agent calls this at plan time and CI
 * calls the identical function at merge time; the two logs are diffed.
 *
 * Read-only over the corpus: decisions are read from each `specs/<id>/design.html`
 * (the source of truth that authored them) through `ctx.fs`. A pre-parsed
 * decision set may be supplied instead (tests, or a caller that already read
 * the corpus).
 */

import { join } from 'node:path';
import { parseDecisions } from '../guardrail/parse.js';
import { decisionsForPaths } from '../guardrail/retrieve.js';
import { buildRetrievalLog, renderRetrievalLog } from '../guardrail/log.js';
import type { DesignDoc, GovernanceDecision, RetrievalLog, RetrievalMatch } from '../guardrail/types.js';
import type { KernelContext } from '../types.js';

export type { DesignDoc, GovernanceDecision, RetrievalMatch, RetrievalLog } from '../guardrail/types.js';
export type { CoverageReport } from '../guardrail/coverage.js';

// Slice-3 gate scans (114) — re-exported so the CLI folds them from one entry.
export { planConstraintFindings } from '../guardrail/plan-constraint.js';
export { isPlanConstraintGatedTier } from '../guardrail/gated-tiers.js';
export { coverageReport } from '../guardrail/coverage.js';

export interface AdrsInput {
  /** The code paths to find governing decisions for. */
  paths: string[];
  /** Resolved project identity — the authority in each decision coordinate. */
  project: string;
  /** Injected clock for the retrieval log timestamp (kept deterministic in tests). */
  now: Date;
  /** Pre-parsed decisions; when omitted the kernel reads specs/<id>/design.html. */
  decisions?: GovernanceDecision[];
}

export interface AdrsResult {
  matches: RetrievalMatch[];
  log: RetrievalLog;
  logText: string;
}

const SPEC_DIR = /^\d{3}-[a-z][a-z0-9-]*$/;

/** Read every `specs/<id>/design.html` as a DesignDoc, sorted by spec id. */
export async function loadDesigns(ctx: KernelContext): Promise<DesignDoc[]> {
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;
  const specsDir = join(ctx.cwd, 'specs');
  let names: string[];
  try {
    names = (await fs.readdir(specsDir)).filter((n) => SPEC_DIR.test(n)).sort();
  } catch {
    return [];
  }
  const designs: DesignDoc[] = [];
  for (const specId of names) {
    const file = join(specsDir, specId, 'design.html');
    try {
      designs.push({ specId, file, html: await fs.readFile(file, 'utf8') });
    } catch {
      // No design.html under this spec — nothing to read; skip.
    }
  }
  return designs;
}

/** Parse every design's decisions (the source of truth that authored them). */
export async function loadDecisions(ctx: KernelContext): Promise<GovernanceDecision[]> {
  return (await loadDesigns(ctx)).flatMap((d) => parseDecisions(d.html, d.specId));
}

export async function adrsCommand(input: AdrsInput, ctx: KernelContext): Promise<AdrsResult> {
  const decisions = input.decisions ?? (await loadDecisions(ctx));
  const matches = decisionsForPaths(input.paths, decisions);
  const log = buildRetrievalLog(input.project, input.paths, matches, input.now);
  return { matches, log, logText: renderRetrievalLog(log) };
}
