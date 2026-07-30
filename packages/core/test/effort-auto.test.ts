import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '@spectastic/core';
import { decide, resolveEffort } from '@spectastic/core/decider';
import { describe, expect, it } from 'vitest';

/**
 * Behavioural tests for auto effort (spec 034-effort-auto). They exercise the
 * pure resolver and the panel voter counts it drives (principle P-7).
 */

describe('resolveEffort — the resolution rule (034 US1)', () => {
  it('an explicit level short-circuits auto (FR-004, SC-002)', () => {
    const r = resolveEffort('high', { irreversible: false, breadth: 0 }, 'low');
    expect(r.level).toBe('high');
    expect(r.reason).toBe('explicit');
  });
  it('auto → high on an irreversible change (FR-002)', () => {
    const r = resolveEffort('auto', { irreversible: true, breadth: 0 }, 'low');
    expect(r.level).toBe('high');
    expect(r.reason).toContain('irreversible');
  });
  it('auto → medium on breadth ≥ 2 (FR-002)', () => {
    const r = resolveEffort('auto', { irreversible: false, breadth: 2 }, 'low');
    expect(r.level).toBe('medium');
  });
  it('auto → floor on a no-signal change (FR-002)', () => {
    const r = resolveEffort('auto', { irreversible: false, breadth: 1 }, 'low');
    expect(r.level).toBe('low');
    expect(r.reason).toContain('floor');
  });
  it('the floor clamps auto from below (FR-003, SC-003)', () => {
    const r = resolveEffort('auto', { irreversible: false, breadth: 0 }, 'high');
    expect(r.level).toBe('high'); // no signal → floor, but floor is high
  });
  it('a null signal (unknown verb) resolves to the floor (FR-006)', () => {
    expect(resolveEffort('auto', null, 'medium').level).toBe('medium');
  });
});

/** A stub that counts critic invocations so the resolved level is observable. */
class CriticStub implements AIProvider {
  readonly model = 'stub-auto';
  public subagentCalls = 0;
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    return {} as T;
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    this.subagentCalls += 1;
    return {
      output: JSON.stringify({
        findings: [{ target: 'FR-001', concern: 'x' }],
      }),
    };
  }
}

describe('auto sizes a panel by resolved level (034 SC-001/003)', () => {
  const runPanel = async (signal: { irreversible: boolean; breadth: number }, floor: 'low' | 'medium' = 'low') => {
    const { level, reason } = resolveEffort('auto', signal, floor);
    const ai = new CriticStub();
    const v = await decide(
      { role: 'panel', effort: level },
      {
        reviewPrompt: 'draft',
        irreversible: signal.irreversible,
        effortReason: reason,
      },
      ai,
    );
    return { voters: ai.subagentCalls, verdict: v };
  };

  it('an irreversible change auto-runs a 3-voter panel (SC-001)', async () => {
    const { voters } = await runPanel({ irreversible: true, breadth: 0 });
    expect(voters).toBe(3);
  });
  it('a trivial change auto-runs at the floor — 1 voter (SC-001)', async () => {
    const { voters } = await runPanel({ irreversible: false, breadth: 0 });
    expect(voters).toBe(1); // low → 1 voter (panel of one)
  });
  it('the floor lifts a no-signal change off the bottom (SC-003)', async () => {
    const { voters } = await runPanel({ irreversible: false, breadth: 0 }, 'medium');
    expect(voters).toBe(1); // medium → 1 voter, but never below the floor level
  });
  it('records the effort reason on the verdict for audit (SC-004)', async () => {
    const { verdict } = await runPanel({ irreversible: true, breadth: 0 });
    expect(verdict.effortReason).toContain('irreversible');
  });
});
