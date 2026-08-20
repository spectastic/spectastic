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

/**
 * The two graded success-criteria judgments (108-success-criteria FR-014, T-903).
 *
 * Six schema rules gate a `<spec-criterion>` deterministically
 * (`packages/schema/src/rules/criterion-*.ts`). Two more cannot be — whether a
 * criterion's vocabulary is stakeholder-facing rather than tool-internal, and
 * whether a green test suite for the requirement(s) it validates would satisfy
 * it automatically (restating the requirement rather than adding an
 * independent, observable claim). FR-014's own rationale is to ride this
 * module's `runCritic`/`parseFindings` rather than stand up a second harness —
 * so `gradeCriterion` below is a thin wrapper over `runCritic`, nothing new.
 * Should-tier and advisory by construction: the caller surfaces these findings
 * to an author; nothing here gates a commit or an apply.
 */
export const CRITERION_LENSES = ['stakeholder-vocabulary', 'test-satisfiability'] as const;
export type CriterionLens = (typeof CRITERION_LENSES)[number];

const CRITERION_LENS_RUBRIC: Record<CriterionLens, string> = {
  'stakeholder-vocabulary':
    "Judge whether this success criterion's actor and vocabulary would be recognised by a stakeholder outside the build team — a person or organisation who is better off, described in their own terms. Flag it if the actor or the outcome names a tool-internal artifact instead (a flag, an exit code, a file, a rule id, the verb itself).",
  'test-satisfiability':
    'Judge whether a green test suite for the requirement(s) this criterion validates would satisfy it automatically — i.e. it restates the requirement rather than making an independent, observable claim about the world. Flag it if a passing implementation could trivially satisfy this criterion with nobody ever sampling the outcome it claims.',
};

/**
 * Run one graded judgment over a single criterion's rendered text. A direct
 * call into `runCritic` with the criterion's prose as the review prompt and
 * the graded rubric folded in — the criterion is the draft under review, the
 * critic never sees its own prior output (no self-judging, FR-006).
 */
export async function gradeCriterion(
  ai: AIProvider,
  criterion: { id: string; text: string },
  lens: CriterionLens,
): Promise<Finding[]> {
  const reviewPrompt = `${CRITERION_LENS_RUBRIC[lens]}\n\nCriterion ${criterion.id}:\n${criterion.text}`;
  const findings = await runCritic(ai, reviewPrompt, lens);
  return findings.map((f) => ({ ...f, target: f.target || criterion.id }));
}

/**
 * Run both graded judgments over every supplied criterion, one critic call per
 * criterion per lens. Advisory only (FR-014 is should-tier) — the caller
 * surfaces the returned findings to the spec's author; nothing here gates a
 * commit or an apply.
 */
export async function gradeCriteria(
  ai: AIProvider,
  criteria: Array<{ id: string; text: string }>,
): Promise<Finding[]> {
  const perCriterion = await Promise.all(
    criteria.map(async (c) => {
      const perLens = await Promise.all(CRITERION_LENSES.map((lens) => gradeCriterion(ai, c, lens)));
      return perLens.flat();
    }),
  );
  return perCriterion.flat();
}
