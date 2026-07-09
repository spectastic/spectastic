/**
 * Kernel for the value-ranked slicer (spec 029-value-ranked-slicer), entered
 * from the `spec` verb's split-mode (plan D-001). It composes the slice/ modules:
 * decompose (chat) → confirm RICE (ask) → order via R-002 → coverage partition +
 * verdict → render the `<spec-split>` proposal. Dry-run: it returns the section
 * for the caller to append to a Draft parent; it mints nothing and cuts no branch.
 *
 * The rival-decomposition panel (FR-009, P2) layers onto `decompose`/`rank`; this
 * P1 path takes a single decomposition + the coverage critic.
 */

import { decompose } from '../slice/decompose.js';
import { confirmRice, orderChildren } from '../slice/rank.js';
import { resolveDecider } from '../decider/index.js';
import { buildCoverage } from '../slice/coverage.js';
import { runCoverageCritic } from '../slice/critic.js';
import { decideVerdict, overBudgetChildren } from '../slice/verdict.js';
import { renderSplitSection } from '../slice/render.js';
import type { SplitModel, Verdict } from '../slice/types.js';
import type { KernelContext } from '../types.js';

export { appendSplitToParent } from '../slice/render.js';
export type { SplitModel, Verdict } from '../slice/types.js';

/**
 * A one-line change intent describing the split, for routing an Accepted parent's
 * split through `/spectastic.propose` (FR-008 SHOULD). The full auto-authoring of
 * the proposal (which mints the children) is deferred to `TBD-w2-mint`; this is
 * the description a human hands to propose.
 */
export function splitProposalIntent(model: SplitModel): string {
  const ids = model.orderedChildren.map((c) => c.specId).join(', ');
  return `Split ${model.parentSpecId} into ${model.orderedChildren.length} slices: ${ids}`;
}

export interface SliceInput {
  /** The parent spec id being split. */
  parentSpecId: string;
  /** The parent's spec.html content (the slicer reads it; the caller wrote/read it). */
  parentHtml: string;
  /**
   * Run the semantic coverage critic (FR-006, SHOULD). Defaults to `true`. Set
   * `false` to skip the subagent pass (e.g. a partition-only run, or a test that
   * scripts no critic).
   */
  runCritic?: boolean;
  /** Decider for the RICE-accept gate (spec 036). Absent → 'human' (parity). */
  decider?: 'human' | 'agent' | 'panel';
  /** Effort sizing a panel accept gate (spec 033/034). Absent → 'medium'. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface SliceResult {
  /** The rendered `<spec-split>` section, for the caller to append to a Draft parent. */
  splitSection: string;
  /** The full proposal model. */
  model: SplitModel;
  /** The split / don't-split verdict (FR-007). */
  verdict: Verdict;
}

export async function sliceCommand(input: SliceInput, ctx: KernelContext): Promise<SliceResult> {
  if (!ctx.ai) throw new Error('sliceCommand requires ctx.ai');

  const { children } = await decompose(input.parentHtml, ctx);
  const acceptCfg = resolveDecider(
    undefined,
    { ...(input.decider ? { role: input.decider } : {}), ...(input.effort ? { effort: input.effort } : {}) },
    'human',
  );
  const confirmed = await confirmRice(children, ctx, acceptCfg);
  const ordered = await orderChildren(confirmed, ctx);

  const partition = buildCoverage(input.parentHtml, ordered);
  const semantic = input.runCritic === false ? undefined : await runCoverageCritic(input.parentHtml, ordered, ctx);
  const coverage = semantic ? { ...partition, semantic } : partition;
  const overBudget = overBudgetChildren(ordered);
  const verdict = decideVerdict({ coverage, children: ordered, overBudget });

  const model: SplitModel = {
    parentSpecId: input.parentSpecId,
    orderedChildren: ordered,
    coverage,
    verdict,
    overBudgetChildren: overBudget,
  };

  return { splitSection: renderSplitSection(model), model, verdict };
}
