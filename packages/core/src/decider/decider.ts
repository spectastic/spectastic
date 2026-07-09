/**
 * The Decider dispatch + guardrails (spec 033-decider-effort).
 *
 * `resolveDecider` applies config precedence; `decide` runs the configured role
 * over the AIProvider and enforces the four non-negotiable guardrails in the
 * kernel (principle P-8), never in command markdown:
 *   - no self-judging: critics judge the supplied draft, never their own output
 *     (FR-006 — holds by construction; the drafter is a separate upstream call);
 *   - diverse lenses + cap: a panel's critics use distinct lenses, capped at 5
 *     (FR-007, via the effort table);
 *   - escalate irreversible: a high-stakes change (caller-supplied signal) marks
 *     the verdict escalatedToHuman — findings stay for human disposition,
 *     never auto-closed (FR-008);
 *   - log verdict: the returned Verdict carries role, effort, voters, and a
 *     per-finding tally the caller records on its register (FR-009).
 */

import type { AIProvider } from '../types.js';
import type { DeciderConfig, DeciderRole, EffortLevel, Verdict } from './types.js';
import { DEFAULT_EFFORT, effortToDepth } from './effort.js';
import { LENSES, arbitrateCategorical, runCritic } from './panel.js';

/**
 * Resolve the effective decider by precedence: per-run override > project config
 * > the checkpoint's own default > global `human` (spec FR-002). A checkpoint
 * that has no opinion leaves `checkpointDefault` at its `human` default.
 */
export function resolveDecider(
  projectCfg: Partial<DeciderConfig> | undefined,
  override: Partial<DeciderConfig> | undefined,
  checkpointDefault: DeciderRole = 'human',
): DeciderConfig {
  return {
    role: override?.role ?? projectCfg?.role ?? checkpointDefault,
    effort: override?.effort ?? projectCfg?.effort ?? DEFAULT_EFFORT,
  };
}

export interface DecideRequest {
  /** The review prompt a critic judges (the authored draft — never a critic's own output). */
  reviewPrompt: string;
  /** True when the change is irreversible/high-stakes (removed-op, must-tier) → escalate (FR-008). */
  irreversible: boolean;
  /** Max findings to keep after arbitration. */
  maxFindings?: number;
  /** How the effort level was chosen (spec 034 FR-005); recorded on the verdict. */
  effortReason?: string;
}

/**
 * Run the configured decider. `human` skips the machine critics entirely (the
 * person authors/dispositions); `agent` runs one critic; `panel` runs N diverse
 * critics sized by the effort level, arbitrated by majority vote.
 */
export async function decide(
  cfg: DeciderConfig,
  req: DecideRequest,
  ai: AIProvider,
): Promise<Verdict> {
  const max = req.maxFindings ?? 3;

  if (cfg.role === 'human') {
    return { ...blankVerdict('human', cfg.effort, true), ...(req.effortReason ? { effortReason: req.effortReason } : {}) };
  }

  const voters = cfg.role === 'agent' ? 1 : effortToDepth(cfg.effort).voters;
  const lenses = LENSES.slice(0, voters); // distinct lenses, already capped by the effort table (FR-007)
  const critiques = await Promise.all(lenses.map((lens) => runCritic(ai, req.reviewPrompt, lens)));

  const { survivors, votesByTarget } = arbitrateCategorical(critiques, voters, max);
  const tally = survivors.map(
    (s) => `${s.concern.slice(0, 60)} — raised by ${votesByTarget.get(s.target) ?? 1}/${voters} critics (${s.lens} lens)`,
  );

  return {
    role: cfg.role,
    effort: cfg.effort,
    voters,
    survivors,
    tally,
    // A non-human decider proposes; on an irreversible change the human still commits (FR-008).
    escalatedToHuman: req.irreversible,
    ...(req.effortReason ? { effortReason: req.effortReason } : {}),
  };
}

function blankVerdict(role: DeciderRole, effort: EffortLevel, escalated: boolean): Verdict {
  return { role, effort, voters: 0, survivors: [], tally: [], escalatedToHuman: escalated };
}
