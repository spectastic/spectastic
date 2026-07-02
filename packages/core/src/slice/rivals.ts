/**
 * Rival decompositions (spec 029, FR-009 / US3, P2). The slicer weighs up to N
 * candidate ways to slice the parent and selects the best — N bounded by the
 * effort level (default medium = ≤ 2; the effort-level primitive is deferred,
 * `TBD-effort-levels`). Selection is objective: a covering (total + disjoint)
 * decomposition wins over an incomplete one, ties broken by higher total RICE
 * value. (The LLM-judge-panel variant of selection is a documented refinement;
 * the objective selector keeps CI deterministic.)
 */

import { riceValue } from '@spectastic/schema';
import { buildCoverage } from './coverage.js';
import type { CandidateChild, Decomposition } from './types.js';
import type { KernelContext } from '../types.js';

const RIVALS_SYSTEM =
  'You are an experienced spec author. Propose distinct ways to decompose an over-budget spec into covering child slices. Output ONLY the requested JSON; no prose, no fences.';

/** Draft up to `max` distinct rival decompositions in one call (default 2, medium effort). */
export async function decomposeRivals(
  parentHtml: string,
  ctx: KernelContext,
  max = 2,
): Promise<Decomposition[]> {
  if (!ctx.ai) throw new Error('decomposeRivals requires ctx.ai');
  const prompt = [
    `Propose up to ${max} distinct decompositions of this over-budget spec. Each decomposition covers every FR/NFR/SC exactly once with independently-demoable children.`,
    'Return JSON: { "decompositions": [ { "children": [ { "specId": "NNN-slug", "title": string, "scope": string, "assignedRequirementIds": ["FR-001", ...], "dependsOn": ["NNN-slug", ...], "rice": { "reach": number, "impact": number, "confidence": number, "effort": number } } ] } ] }',
    '',
    'Spec:',
    parentHtml.slice(0, 6000),
  ].join('\n');
  const raw = await ctx.ai.chat(prompt, { temperature: 0.4, system: RIVALS_SYSTEM });
  return parseRivals(raw).slice(0, max);
}

type DraftChild = Omit<CandidateChild, 'riceConfirmed'>;

function parseRivals(raw: string): Decomposition[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: { decompositions?: Array<{ children?: DraftChild[] }> };
  try {
    parsed = JSON.parse(stripped) as { decompositions?: Array<{ children?: DraftChild[] }> };
  } catch {
    throw new Error('decomposeRivals: AI returned non-JSON rivals');
  }
  return (parsed.decompositions ?? []).map((d) => ({
    children: (d.children ?? []).map((c) => ({ ...c, riceConfirmed: false })),
  }));
}

/** Total RICE value of a decomposition's children. */
function totalValue(children: readonly CandidateChild[]): number {
  return children.reduce((sum, c) => sum + riceValue(c.rice), 0);
}

/**
 * Select the best rival: a total + disjoint decomposition beats an incomplete one;
 * ties break by higher total RICE value. Returns `null` for an empty rival set.
 */
export function selectBestDecomposition(
  rivals: readonly Decomposition[],
  parentHtml: string,
): Decomposition | null {
  if (rivals.length === 0) return null;
  const scored = rivals.map((d) => ({
    d,
    covering: buildCoverage(parentHtml, d.children).isTotalAndDisjoint,
    value: totalValue(d.children),
  }));
  scored.sort((a, b) => {
    if (a.covering !== b.covering) return a.covering ? -1 : 1;
    return b.value - a.value;
  });
  return scored[0]!.d;
}
