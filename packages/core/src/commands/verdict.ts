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
import { mergeForeignDecisions } from '../decisions/merge.js';
import { validateIndex } from '../decisions/index.js';
import type { DeclaredDecisionSource, DecisionSource, GovernanceDecision, Verdict } from '../guardrail/types.js';
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
  /**
   * Declared federation sources (spec 122-decision-index-federation, D-001),
   * resolved from config at the CLI edge and injected as data — the kernel
   * still reads no config. When present, each source's vendored copy at
   * `.spectastic/decisions/<project>.json` is read via `ctx.fs`, validated,
   * and merged; local decisions are unaffected (FR-006).
   */
  sources?: DeclaredDecisionSource[];
}

export interface VerdictCommandResult {
  verdict: Verdict;
  verdictText: string;
  hasViolation: boolean;
  /** The pre-read changed-file contents, so `--explain` reuses them (no re-read). */
  contents: Map<string, string>;
}

/** `.spectastic/decisions/<project with / → -->.json` (spec 122, D-004).
 *  Exported so `decisions sync` (the writer) and this verdict (the reader)
 *  share one path convention rather than each deriving it independently. */
export function vendoredSourcePath(project: string): string {
  return `.spectastic/decisions/${project.replaceAll('/', '--')}.json`;
}

/**
 * Read, validate, and merge one declared source's vendored copy (spec
 * FR-006/FR-008). Throws — naming the source — on a missing copy, a copy
 * that fails validation, or one that disagrees with its recorded pin;
 * FR-008 stops the whole verdict rather than skipping the source silently.
 */
async function readForeignSource(
  declared: DeclaredDecisionSource,
  fs: NonNullable<KernelContext['fs']>,
): Promise<{ source: DecisionSource; decisions: GovernanceDecision[] }> {
  const path = vendoredSourcePath(declared.project);
  let text: string;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch {
    throw new Error(
      `verdict: declared source "${declared.project}" has no vendored copy at ${path} — run \`spectastic decisions sync\`.`,
    );
  }
  const validated = validateIndex(text, declared.project);
  if (!validated.ok) {
    throw new Error(`verdict: declared source "${declared.project}"'s vendored copy is invalid — ${validated.reason}.`);
  }
  if (declared.pin !== undefined && declared.pin !== validated.index.contentHash) {
    throw new Error(
      `verdict: declared source "${declared.project}"'s vendored copy disagrees with its recorded pin — run \`spectastic decisions sync\`.`,
    );
  }
  const merged = mergeForeignDecisions(validated.index.decisions);
  return {
    source: {
      project: declared.project,
      from: declared.from,
      contentHash: validated.index.contentHash,
      decisionsEvaluated: merged.evaluated,
      decisionsIgnored: merged.ignored,
      decisionsRefused: merged.refused,
    },
    decisions: merged.decisions,
  };
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

  // Federation (spec 122): each declared source's vendored copy is read,
  // validated, and merged BESIDE the local decisions so one verdictFor pass
  // evaluates both — a foreign resource-scoped decision's owner is never
  // this project (FR-003 refuses self-reference at the config edge), so the
  // existing owner-aware branch in verdictFor already flags any touch here
  // as an ownership violation with no change to that pure kernel.
  let foreignDecisions: GovernanceDecision[] = [];
  let sources: DecisionSource[] | undefined;
  if (input.sources && input.sources.length > 0) {
    sources = [];
    for (const declared of input.sources) {
      const read = await readForeignSource(declared, fs);
      sources.push(read.source);
      foreignDecisions = foreignDecisions.concat(read.decisions);
    }
  }

  const verdict = verdictFor({
    changed: input.changed,
    decisions: [...decisions, ...foreignDecisions],
    now: input.now,
    readFile: (p) => contents.get(normalisePath(p)) ?? null,
    ...(input.sarif !== undefined ? { sarif: input.sarif } : {}),
    ...(input.currentProject !== undefined ? { currentProject: input.currentProject } : {}),
  });

  if (sources !== undefined) {
    // The existing total keeps its meaning — LOCAL accepted decisions only
    // (FR-007); verdictFor's own count, computed over the combined array,
    // would otherwise silently absorb the foreign decisions too.
    verdict.decisionsEvaluated = decisions.filter((d) => d.status === 'accepted').length;
    verdict.scope = 'federated';
    verdict.sources = sources;
  }

  return { verdict, verdictText: renderVerdict(verdict), hasViolation: hasViolation(verdict), contents };
}
