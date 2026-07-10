/**
 * `runPipeline` — the hands-off pipeline driver (spec 037, FR-001…FR-009).
 *
 * Drives the injected steps in order. For each: it fires a human checkpoint if the
 * policy requires one before this step (FR-007); answers the step's bounded
 * decisions through the Decider (FR-002/FR-004/FR-005, via 039 answerDecisions);
 * runs the step; and halts-and-escalates on a validate finding or a drain halt
 * (FR-001/NFR-002). A human "stop" at any checkpoint is a hard gate. The role is
 * threaded as config — never chosen by markdown (FR-003). Idempotent: the driver
 * holds no state beyond the artifacts the steps write (FR-009).
 */

import { answerDecisions } from '../decider/taxonomy.js';
import { degradeEffort } from './budget.js';
import type { RunContext, RunInput, RunResult } from './types.js';

/** Does a planned human checkpoint precede `stepName` under `policy` (FR-007)? */
export function needsCheckpoint(stepName: string, policy: 'minimal' | 'each'): boolean {
  if (stepName === 'implement') return true; // the pre-implement gate — always
  if (policy === 'each' && stepName === 'tasks') return true; // after plan, under --checkpoints=each
  return false;
}

export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunError';
  }
}

/** Answer a step's bounded decisions through the Decider, degrading effort under budget (040 FR-002). */
async function answerStepDecisions(
  step: RunContext['steps'][number],
  input: RunInput,
  ctx: RunContext,
): Promise<Record<string, string>> {
  if (!step.decisionVerb) return {};
  const effort =
    ctx.budget?.phase() === 'degrade' ? degradeEffort(input.decider.effort) : input.decider.effort;
  return answerDecisions(step.decisionVerb, { ...input.decider, effort }, ctx.ai);
}

export async function runPipeline(input: RunInput, ctx: RunContext): Promise<RunResult> {
  if (input.decider.role === 'human') {
    // A human decider can't answer unattended; refuse rather than escalate every call.
    throw new RunError('run: decider=human cannot drive an unattended run — configure agent or panel');
  }

  const ranSteps: string[] = [];
  const decisions: Record<string, Record<string, string>> = {};

  for (const step of ctx.steps) {
    // Budget hard ceiling (040 FR-003): halt + escalate before the next decision.
    if (ctx.budget?.phase() === 'halt') {
      const reason = `budget exhausted (~${ctx.budget.spent} est. output tokens)`;
      await ctx.escalate({ phase: step.name, reason });
      return { completed: false, ranSteps, decisions, halted: { phase: step.name, reason } };
    }

    // Planned checkpoint before this step.
    if (needsCheckpoint(step.name, input.checkpoints)) {
      const answer = await ctx.escalate({ phase: step.name, reason: 'planned checkpoint' });
      if (answer === 'stop') {
        return { completed: false, ranSteps, decisions, halted: { phase: step.name, reason: 'human stopped at checkpoint' } };
      }
    }

    // Answer this step's bounded decisions through the Decider (039), degrading the
    // effort under budget pressure (040 FR-002) — a run with no budget is unchanged.
    const stepDecisions = await answerStepDecisions(step, input, ctx);
    if (step.decisionVerb) decisions[step.name] = stepDecisions;

    const outcome = await step.run({ decisions: stepDecisions });
    ranSteps.push(step.name);

    // validate gate (FR-001) + drain halt (038): an error/halt escalates + stops.
    const stopReason =
      outcome.findings && outcome.findings.length > 0
        ? `validate error: ${outcome.findings.join('; ')}`
        : outcome.halted?.reason;
    if (stopReason) {
      await ctx.escalate({ phase: step.name, reason: stopReason });
      return { completed: false, ranSteps, decisions, halted: { phase: step.name, reason: stopReason } };
    }
  }

  return { completed: true, ranSteps, decisions };
}
