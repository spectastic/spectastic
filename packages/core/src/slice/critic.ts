/**
 * The semantic coverage critic (spec 029, FR-006 / plan D-004) — the SHOULD layer
 * on top of the pure partition. A `ctx.ai.subagent` pass judging whether the
 * children together drop nothing meaningful and whether each is a genuine vertical
 * slice (independently demoable), not a horizontal layer. Extends propose's
 * single-subagent precedent; the partition (FR-005) remains the hard gate.
 */

import type { CandidateChild, SemanticVerdict } from './types.js';
import type { KernelContext } from '../types.js';

const CRITIC_SYSTEM =
  'You are an adversarial coverage critic for a proposed spec split. Judge two things: (1) do the children, together, drop nothing meaningful from the parent? (2) is each child a genuine vertical slice — independently demoable — rather than a horizontal layer? Return ONLY JSON: { "ok": boolean, "notes": [string, ...] }.';

export async function runCoverageCritic(
  parentHtml: string,
  children: readonly CandidateChild[],
  ctx: KernelContext,
): Promise<SemanticVerdict | undefined> {
  if (!ctx.ai) return undefined;
  const summary = children
    .map((c) => `- ${c.specId} "${c.title}": ${c.scope} [covers ${c.assignedRequirementIds.join(', ')}]`)
    .join('\n');
  const prompt = [CRITIC_SYSTEM, '', 'Parent excerpt:', parentHtml.slice(0, 3000), '', 'Proposed children:', summary].join('\n');
  const res = await ctx.ai.subagent(prompt, { task: 'coverage-critic' });
  return parseVerdict(res.output);
}

function parseVerdict(raw: string): SemanticVerdict | undefined {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const p = JSON.parse(stripped) as { ok?: unknown; notes?: unknown };
    return {
      ok: p.ok === true,
      notes: Array.isArray(p.notes) ? p.notes.map((n) => String(n)) : [],
    };
  } catch {
    return undefined;
  }
}
