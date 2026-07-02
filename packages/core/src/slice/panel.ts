/**
 * The bias-resistant ranking panel (spec 029, FR-009 / NFR-001 / plan D-006). N
 * independent scorer subagents rate each child's RICE inputs; the panel takes the
 * MEDIAN of each input, so no single outlier/biased judge decides the order.
 * Extends propose's single-subagent precedent to a panel (P2). With no provider
 * or no votes, a child keeps its original estimate.
 */

import type { RiceInputs } from '@spectastic/schema';
import type { CandidateChild } from './types.js';
import type { KernelContext } from '../types.js';

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median of each RICE input across a panel's votes. */
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
 * Re-score the children with `scorers` independent panellists and median-aggregate
 * each RICE input (NFR-001 ≥ 3). A child with no valid votes keeps its estimate.
 */
export async function panelScore(
  children: readonly CandidateChild[],
  ctx: KernelContext,
  scorers = 3,
): Promise<CandidateChild[]> {
  if (!ctx.ai || children.length === 0) return [...children];

  const votes = new Map<string, RiceInputs[]>(children.map((c) => [c.specId, []]));
  const roster = children.map((c) => `- ${c.specId} "${c.title}": ${c.scope}`).join('\n');
  for (let i = 0; i < scorers; i++) {
    const res = await ctx.ai.subagent(`${SCORER_SYSTEM}\n\nChildren:\n${roster}`, {
      task: `ranking-scorer-${i}`,
    });
    const scored = parseScores(res.output);
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
    typeof r['reach'] === 'number' &&
    typeof r['impact'] === 'number' &&
    typeof r['confidence'] === 'number' &&
    typeof r['effort'] === 'number' &&
    r['effort'] > 0
  );
}
