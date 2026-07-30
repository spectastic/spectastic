/**
 * The bias-resistant ranking panel (spec 029, FR-009 / NFR-001 / plan D-006). N
 * independent scorer subagents rate each child's RICE inputs; the panel takes the
 * MEDIAN of each input, so no single outlier/biased judge decides the order.
 *
 * Per spec 035-decider-rollout this panel is a Decider adopter: its scorer count
 * comes from the Decider effort table (floored at `high` = 3, preserving 029's
 * ≥ 3 rule; up to 5), the scorers fan out under 032's bounded pool, and the
 * aggregation shares the Decider's numeric arbitration (median) — the second
 * checkpoint to consume the Decider, proving it verb-agnostic.
 */

import type { RiceInputs } from '@spectastic/schema';
import { type RequestedEffort, resolveEffort } from '../decider/auto.js';
import { effortToDepth } from '../decider/effort.js';
import { median } from '../decider/panel.js';
import { mapPool } from '../helpers/map-pool.js';
import type { KernelContext } from '../types.js';
import type { CandidateChild } from './types.js';

/** Median of each RICE input across a panel's votes (shared Decider median, 035 FR-005). */
export function medianRice(votes: RiceInputs[]): RiceInputs {
  return {
    reach: median(votes.map((v) => v.reach)),
    impact: median(votes.map((v) => v.impact)),
    confidence: median(votes.map((v) => v.confidence)),
    effort: median(votes.map((v) => v.effort)),
  };
}

const SCORER_SYSTEM =
  'You are one independent RICE scorer on a panel. Score each candidate child slice on reach, impact, confidence (0-1), and effort (>0). Judge on the merits; ignore ordering and verbosity. Return ONLY JSON: { "<specId>": { "reach": n, "impact": n, "confidence": n, "effort": n }, ... }.';

/**
 * Re-score the children with N independent panellists and median-aggregate each
 * RICE input. `opts` is either an explicit scorer count (029 back-compat) or a
 * Decider config `{ effort }` — absent, the count is Decider-resolved from the
 * candidate breadth with a `high` floor (spec 035 FR-001/002/003). Scorers fan
 * out concurrently (FR-004). A child with no valid votes keeps its estimate.
 */
export async function panelScore(
  children: readonly CandidateChild[],
  ctx: KernelContext,
  opts?: number | { effort?: RequestedEffort },
): Promise<CandidateChild[]> {
  const ai = ctx.ai;
  if (!ai || children.length === 0) return [...children];

  const scorers =
    typeof opts === 'number'
      ? opts
      : effortToDepth(
          resolveEffort(opts?.effort ?? 'auto', { irreversible: false, breadth: children.length }, 'high').level,
        ).voters;

  const roster = children.map((c) => `- ${c.specId} "${c.title}": ${c.scope}`).join('\n');
  const scoreOnce = async (i: number): Promise<Record<string, unknown>> => {
    const res = await ai.subagent(`${SCORER_SYSTEM}\n\nChildren:\n${roster}`, {
      task: `ranking-scorer-${i}`,
    });
    return parseScores(res.output);
  };
  // Fan the scorers out under the bounded pool (spec 032) instead of a serial loop.
  const results = await mapPool(
    Array.from({ length: scorers }, (_, i) => i),
    scoreOnce,
    scorers,
  );

  const votes = new Map<string, RiceInputs[]>(children.map((c) => [c.specId, []]));
  for (const scored of results) {
    for (const c of children) {
      const r = scored[c.specId];
      if (isRice(r)) votes.get(c.specId)!.push(r);
    }
  }

  return children.map((c) => {
    const vs = votes.get(c.specId)!;
    return vs.length > 0 ? { ...c, rice: medianRice(vs) } : c;
  });
}

function parseScores(raw: string): Record<string, unknown> {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const p = JSON.parse(stripped) as unknown;
    return p !== null && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isRice(v: unknown): v is RiceInputs {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.reach === 'number' &&
    typeof r.impact === 'number' &&
    typeof r.confidence === 'number' &&
    typeof r.effort === 'number' &&
    r.effort > 0
  );
}
