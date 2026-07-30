import { describe, expect, it } from 'vitest';
import type { DeciderConfig } from '../src/decider/types.js';
import { BudgetTracker, budgeted, degradeEffort, estimateTokens } from '../src/run/budget.js';
import { runPipeline } from '../src/run/pipeline.js';
import type { Checkpoint, PipelineStep, StepOutcome } from '../src/run/types.js';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../src/types.js';

/**
 * 040 — the run budget. Unit: estimate, phase bands, degradeEffort, the budgeted
 * wrapper. Behaviour: a budget in `degrade` lowers the Decider effort (fewer
 * voters, SC-001); `halt` stops + escalates before the next decision (SC-002); no
 * budget is byte-parity with a 037 run (SC-003).
 */

class Stub implements AIProvider {
  readonly model = 'stub-budget';
  public subCalls = 0;
  constructor(private readonly subOut: string) {}
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return 'chat-response';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    return {} as T;
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    this.subCalls += 1;
    return { output: this.subOut };
  }
}

const DECISIONS = '{"Test style":"TDD","Risk tolerance":"Low"}';

function fakeStep(name: PipelineStep['name'], ran: string[], decisionVerb?: string): PipelineStep {
  return {
    name,
    ...(decisionVerb ? { decisionVerb } : {}),
    async run(): Promise<StepOutcome> {
      ran.push(name);
      return {};
    },
  };
}

function recorder() {
  const seen: Checkpoint[] = [];
  return {
    fn: async (c: Checkpoint) => {
      seen.push(c);
      return 'approve' as const;
    },
    seen,
  };
}

const PANEL_HIGH: DeciderConfig = { role: 'panel', effort: 'high' };

describe('budget primitives (040)', () => {
  it('estimateTokens ≈ chars/4', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('phase: no ceiling → normal; 80% → degrade; 100% → halt (FR-001)', () => {
    expect(new BudgetTracker().phase()).toBe('normal');
    const t = new BudgetTracker(100);
    t.spent = 79;
    expect(t.phase()).toBe('normal');
    t.spent = 80;
    expect(t.phase()).toBe('degrade');
    t.spent = 100;
    expect(t.phase()).toBe('halt');
  });

  it('degradeEffort steps one band, floor-clamped (FR-002)', () => {
    expect(degradeEffort('high')).toBe('medium');
    expect(degradeEffort('max')).toBe('xhigh');
    expect(degradeEffort('low')).toBe('low'); // floor
    expect(degradeEffort('medium', 'medium')).toBe('medium'); // floor override
  });

  it('budgeted wrapper records each response against the tracker (D-003)', async () => {
    const t = new BudgetTracker(1000);
    const ai = budgeted(new Stub('sub-out'), t);
    await ai.chat('x');
    await ai.subagent('y');
    expect(t.spent).toBe(estimateTokens('chat-response') + estimateTokens('sub-out'));
  });
});

describe('runPipeline under budget (040)', () => {
  it('degrades the Decider effort at 80% — fewer voters (SC-001)', async () => {
    const tracker = new BudgetTracker(100);
    tracker.spent = 85; // degrade
    const stub = new Stub(DECISIONS);
    await runPipeline(
      { specId: 'x', decider: PANEL_HIGH, checkpoints: 'minimal' },
      {
        ai: stub,
        steps: [fakeStep('plan', [], 'plan')],
        escalate: recorder().fn,
        budget: tracker,
      },
    );
    // high = 3 voters → degraded to medium = 1 voter.
    expect(stub.subCalls).toBe(1);
  });

  it('halts + escalates before the next decision at 100% (SC-002)', async () => {
    const tracker = new BudgetTracker(100);
    tracker.spent = 100; // halt
    const ran: string[] = [];
    const esc = recorder();
    const result = await runPipeline(
      { specId: 'x', decider: PANEL_HIGH, checkpoints: 'minimal' },
      {
        ai: new Stub(DECISIONS),
        steps: [fakeStep('plan', ran, 'plan')],
        escalate: esc.fn,
        budget: tracker,
      },
    );
    expect(result.completed).toBe(false);
    expect(result.halted?.reason).toMatch(/budget exhausted/);
    expect(esc.seen[0]?.reason).toMatch(/budget exhausted/);
    expect(ran).toEqual([]); // stopped before running the step
  });

  it('no budget → full effort, byte-parity with a 037 run (SC-003)', async () => {
    const stub = new Stub(DECISIONS);
    const result = await runPipeline(
      { specId: 'x', decider: PANEL_HIGH, checkpoints: 'minimal' },
      {
        ai: stub,
        steps: [fakeStep('plan', [], 'plan')],
        escalate: recorder().fn,
      },
    );
    expect(result.completed).toBe(true);
    expect(stub.subCalls).toBe(3); // high = 3 voters, undegraded
  });
});
