import { describe, expect, it } from 'vitest';
import type { DeciderConfig } from '../src/decider/types.js';
import { needsCheckpoint, runPipeline } from '../src/run/pipeline.js';
import type { Checkpoint, PipelineStep, RunContext, StepOutcome } from '../src/run/types.js';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../src/types.js';

/**
 * 037 driver tests. They RUN the driver over fake steps and assert order, the
 * validate/escalation gates, decision-answering by role, and the hard human stop.
 * The real kernel-wiring steps are thin adapters over already-tested kernels
 * (038/039/plan/tasks/verify), exercised at the CLI/smoke level.
 */

class Stub implements AIProvider {
  readonly model = 'stub-run';
  public subCalls = 0;
  public askCalls = 0;
  constructor(private readonly subOut: string) {}
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    this.askCalls += 1;
    return {} as T;
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    this.subCalls += 1;
    return { output: this.subOut };
  }
}

const AGENT: DeciderConfig = { role: 'agent', effort: 'medium' };

/** A fake step that records its run and returns a scripted outcome. */
function fakeStep(
  name: PipelineStep['name'],
  ran: string[],
  opts: { decisionVerb?: string; outcome?: StepOutcome } = {},
): PipelineStep {
  return {
    name,
    ...(opts.decisionVerb ? { decisionVerb: opts.decisionVerb } : {}),
    async run(): Promise<StepOutcome> {
      ran.push(name);
      return opts.outcome ?? {};
    },
  };
}

/** An escalate that records each checkpoint and answers per the script. */
function recorder(answer: 'approve' | 'stop' | ((c: Checkpoint) => 'approve' | 'stop')) {
  const seen: Checkpoint[] = [];
  const fn = async (c: Checkpoint): Promise<'approve' | 'stop'> => {
    seen.push(c);
    return typeof answer === 'function' ? answer(c) : answer;
  };
  return { fn, seen };
}

const DECISIONS_JSON = '{"Test style":"TDD","Risk tolerance":"Low","Execution strategy":"Incremental"}';

function ctx(steps: PipelineStep[], escalate: RunContext['escalate'], subOut = DECISIONS_JSON): RunContext {
  return { ai: new Stub(subOut), steps, escalate };
}

describe('runPipeline — the chain, validated, decisions answered (037 SC-001)', () => {
  it('drives design→tasks→implement→verify in order and records decisions', async () => {
    const ran: string[] = [];
    const steps = [
      fakeStep('design', ran, { decisionVerb: 'design' }),
      fakeStep('tasks', ran, { decisionVerb: 'tasks' }),
      fakeStep('implement', ran),
      fakeStep('verify', ran),
    ];
    const esc = recorder('approve');
    const result = await runPipeline({ specId: 'x', decider: AGENT, checkpoints: 'minimal' }, ctx(steps, esc.fn));
    expect(result.completed).toBe(true);
    expect(result.ranSteps).toEqual(['design', 'tasks', 'implement', 'verify']);
    expect(result.decisions.design?.['Test style']).toBe('TDD');
    expect(result.decisions.tasks?.['Execution strategy']).toBe('Incremental');
  });

  it('halts + escalates on a validate finding, not proceeding to the next step', async () => {
    const ran: string[] = [];
    const steps = [fakeStep('design', ran, { outcome: { findings: ['spec-question-open'] } }), fakeStep('tasks', ran)];
    const esc = recorder('approve');
    const result = await runPipeline({ specId: 'x', decider: AGENT, checkpoints: 'minimal' }, ctx(steps, esc.fn));
    expect(result.completed).toBe(false);
    expect(result.ranSteps).toEqual(['design']); // tasks never ran
    expect(result.halted?.phase).toBe('design');
    expect(esc.seen.some((c) => /validate error/.test(c.reason))).toBe(true);
  });

  it('halts on a drain halt from the implement step (038)', async () => {
    const ran: string[] = [];
    const steps = [
      fakeStep('implement', ran, {
        outcome: { halted: { taskId: 'T-100', reason: 'verify failed' } },
      }),
      fakeStep('verify', ran),
    ];
    const result = await runPipeline(
      { specId: 'x', decider: AGENT, checkpoints: 'minimal' },
      ctx(steps, recorder('approve').fn),
    );
    expect(result.completed).toBe(false);
    expect(result.halted?.reason).toMatch(/verify failed/);
    expect(ran).not.toContain('verify');
  });
});

describe('runPipeline — decider role (037 SC-002)', () => {
  it('answers decisions via the agent decider (subagent), not ai.ask', async () => {
    const ran: string[] = [];
    const stub = new Stub(DECISIONS_JSON);
    const steps = [fakeStep('design', ran, { decisionVerb: 'design' })];
    await runPipeline(
      { specId: 'x', decider: AGENT, checkpoints: 'minimal' },
      { ai: stub, steps, escalate: recorder('approve').fn },
    );
    expect(stub.subCalls).toBeGreaterThan(0);
    expect(stub.askCalls).toBe(0);
  });

  it('refuses a human decider — an unattended run cannot answer by hand', async () => {
    const steps = [fakeStep('design', [], {})];
    await expect(
      runPipeline(
        {
          specId: 'x',
          decider: { role: 'human', effort: 'medium' },
          checkpoints: 'minimal',
        },
        ctx(steps, recorder('approve').fn),
      ),
    ).rejects.toThrow(/human/);
  });
});

describe('runPipeline — escalation gate (037 SC-003)', () => {
  it('pauses before implement and halts on a human stop (hard gate)', async () => {
    const ran: string[] = [];
    const steps = [
      fakeStep('design', ran),
      fakeStep('tasks', ran),
      fakeStep('implement', ran),
      fakeStep('verify', ran),
    ];
    const esc = recorder((c) => (c.phase === 'implement' ? 'stop' : 'approve'));
    const result = await runPipeline({ specId: 'x', decider: AGENT, checkpoints: 'minimal' }, ctx(steps, esc.fn));
    expect(result.completed).toBe(false);
    expect(result.ranSteps).toEqual(['design', 'tasks']); // implement gated off
    expect(result.halted?.phase).toBe('implement');
  });

  it('resumes on approval and completes', async () => {
    const ran: string[] = [];
    const steps = [fakeStep('design', ran), fakeStep('implement', ran), fakeStep('verify', ran)];
    const result = await runPipeline(
      { specId: 'x', decider: AGENT, checkpoints: 'minimal' },
      ctx(steps, recorder('approve').fn),
    );
    expect(result.completed).toBe(true);
    expect(ran).toContain('implement');
  });

  it('--checkpoints=each gates before tasks and before implement', () => {
    expect(needsCheckpoint('tasks', 'each')).toBe(true);
    expect(needsCheckpoint('tasks', 'minimal')).toBe(false);
    expect(needsCheckpoint('implement', 'minimal')).toBe(true);
    expect(needsCheckpoint('design', 'each')).toBe(false);
  });
});
