/**
 * Panel mechanics for the Decider (spec 033-decider-effort FR-005 / FR-007).
 *
 * A panel runs N critics, each from a DISTINCT lens (never N identical copies),
 * then arbitrates type-dependently: categorical findings (which risks survive?)
 * by majority vote; numeric votes by median (the aggregation slice/panel.ts
 * already uses). Critics judge the supplied draft — never each other's output —
 * so the no-self-judging guardrail (FR-006) holds by construction.
 */

import type { AIProvider } from '../types.js';
import type { Finding } from './types.js';

/** The distinct lenses a panel draws from, in order. Capped by the effort table. */
export const LENSES = ['security', 'correctness', 'user-impact', 'maintainability', 'cost'] as const;

/** Run one critic from a given lens over the review prompt; returns its findings. */
export async function runCritic(ai: AIProvider, reviewPrompt: string, lens: string): Promise<Finding[]> {
  const system = `You are an adversarial reviewer judging strictly through the ${lens} lens. Identify concrete risks in the change under review. Judge on the merits; ignore ordering and verbosity. Return ONLY JSON: { "findings": [ { "target": string, "concern": string }, ... ] }.`;
  const res = await ai.subagent(`${system}\n\n${reviewPrompt}`, {
    task: `decider-critic-${lens}`,
  });
  return parseFindings(res.output).map((f) => ({ ...f, lens }));
}

/** Parse a critic's JSON, accepting either `findings` or `risks` (both [{target,concern}]). */
export function parseFindings(raw: string): Finding[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const p = JSON.parse(stripped) as {
      findings?: RawFinding[];
      risks?: RawFinding[];
    };
    const list = p.findings ?? p.risks ?? [];
    return list
      .filter((f) => f && typeof f.target === 'string' && typeof f.concern === 'string')
      .map((f) => ({ target: f.target, concern: f.concern }));
  } catch {
    return [];
  }
}

interface RawFinding {
  target: string;
  concern: string;
}

/**
 * Categorical arbitration (FR-005): a finding survives if a MAJORITY of the N
 * critics raised its target. Findings are grouped by target; the first critic's
 * wording + lens represents the group. Returns up to `max` survivors, most-voted
 * first. With voters=1 (single agent / degraded panel), every finding survives.
 */
export function arbitrateCategorical(
  critiques: Finding[][],
  voters: number,
  max: number,
): { survivors: Finding[]; votesByTarget: Map<string, number> } {
  // Vote count per target — one vote per target per critic.
  const votesByTarget = new Map<string, number>();
  const repByTarget = new Map<string, Finding>();
  for (const critique of critiques) {
    const seen = new Set<string>();
    for (const f of critique) {
      if (!repByTarget.has(f.target)) repByTarget.set(f.target, f);
      if (seen.has(f.target)) continue;
      seen.add(f.target);
      votesByTarget.set(f.target, (votesByTarget.get(f.target) ?? 0) + 1);
    }
  }

  // A single critic (agent, or a panel degraded to 1 voter) is not a vote — keep
  // its findings as authored, capped. Preserves the pre-Decider behaviour.
  if (voters <= 1) {
    return { survivors: (critiques[0] ?? []).slice(0, max), votesByTarget };
  }

  // A real panel: one representative per target a MAJORITY raised, most-voted first.
  const threshold = Math.ceil(voters / 2);
  const survivors = [...votesByTarget.entries()]
    .filter(([, v]) => v >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([target]) => repByTarget.get(target)!);
  return { survivors, votesByTarget };
}

/** Numeric arbitration (FR-005): the median of N votes — the slice/panel.ts model. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
