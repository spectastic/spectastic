/**
 * Rank + order the candidate children (spec 029, FR-003 / FR-004 / D-008).
 * RICE is agent-estimated in `decompose`; here it is surfaced for human
 * confirmation via `ctx.ai.ask` (provisional until confirmed), then the children
 * are ordered by handing their synthetic corpus to R-002's `orderCommand`.
 */

import { orderCommand } from '../commands/order.js';
import { decideChoice } from '../decider/choice.js';
import type { DeciderConfig } from '../decider/types.js';
import type { KernelContext } from '../types.js';
import { buildSyntheticCorpus } from './corpus.js';
import type { CandidateChild } from './types.js';

/** The choice checkpoint's default decider (spec 036): a human, unless configured otherwise. */
const HUMAN: DeciderConfig = { role: 'human', effort: 'medium' };

/**
 * Surface the estimated RICE for confirmation (FR-004). A single bounded-choice
 * gate: Accept marks every child confirmed; Adjust leaves them provisional (the
 * richer per-input edit is a later refinement). With no provider, returns the
 * children untouched (provisional).
 *
 * Per spec 036 the gate routes through the configured Decider (`cfg`, default
 * human): a human, agent, or panel answers Accept/Adjust. No self-judging — the
 * accept-decider is a fresh invocation, distinct from the upstream RICE estimator.
 */
export async function confirmRice(
  children: readonly CandidateChild[],
  ctx: KernelContext,
  cfg: DeciderConfig = HUMAN,
): Promise<CandidateChild[]> {
  if (!ctx.ai) return [...children];
  const res = await decideChoice(
    cfg,
    [
      {
        question: 'Accept the estimated RICE inputs for the candidate children?',
        header: 'RICE',
        options: [
          {
            label: 'Accept',
            description: 'Use the estimates as the ranking inputs.',
          },
          {
            label: 'Adjust',
            description: 'Leave provisional — revisit the inputs before ranking.',
          },
        ],
      },
    ],
    ctx.ai,
  );
  const accepted = res.RICE === 'Accept';
  return children.map((c) => ({ ...c, riceConfirmed: accepted }));
}

/**
 * Order the children by R-002 over their synthetic corpus (FR-003). Returns them
 * in dependency-respecting, value-ranked order. An empty input yields an empty
 * order; a single child needs no ordering.
 */
export async function orderChildren(
  children: readonly CandidateChild[],
  ctx: KernelContext,
): Promise<CandidateChild[]> {
  if (children.length <= 1) return [...children];
  const corpus = buildSyntheticCorpus(children);
  const { ids } = await orderCommand({ corpus }, ctx);
  const byId = new Map(children.map((c) => [c.specId, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is CandidateChild => c !== undefined);
}
