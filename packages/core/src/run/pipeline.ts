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

export async function runPipeline(input: RunInput, ctx: RunContext): Promise<RunResult> {
  if (input.decider.role === 'human') {
    // A human decider can't answer unattended; refuse rather than escalate every call.
    throw new RunError('run: decider=human cannot drive an unattended run — configure agent or panel');
  }

  const ranSteps: string[] = [];
  const decisions: Record<string, Record<string, string>> = {};

  for (const step of ctx.steps) {
    // Planned checkpoint before this step.
    if (needsCheckpoint(step.name, input.checkpoints)) {
      const answer = await ctx.escalate({ phase: step.name, reason: 'planned checkpoint' });
      if (answer === 'stop') {
        return { completed: false, ranSteps, decisions, halted: { phase: step.name, reason: 'human stopped at checkpoint' } };
      }
    }

    // Answer this step's bounded decisions through the Decider (039).
    let stepDecisions: Record<string, string> = {};
    if (step.decisionVerb) {
      stepDecisions = await answerDecisions(step.decisionVerb, input.decider, ctx.ai);
      decisions[step.name] = stepDecisions;
    }

    const outcome = await step.run({ decisions: stepDecisions });
    ranSteps.push(step.name);

    // validate gate (FR-001): an error finding halts + escalates.
    if (outcome.findings && outcome.findings.length > 0) {
      await ctx.escalate({ phase: step.name, reason: `validate error: ${outcome.findings.join('; ')}` });
      return { completed: false, ranSteps, decisions, halted: { phase: step.name, reason: `validate error: ${outcome.findings.join('; ')}` } };
    }

    // drain halt (038): an unverified task halts + escalates.
    if (outcome.halted) {
      await ctx.escalate({ phase: step.name, reason: outcome.halted.reason });
      return { completed: false, ranSteps, decisions, halted: { phase: step.name, reason: outcome.halted.reason } };
    }
  }

  return { completed: true, ranSteps, decisions };
}
