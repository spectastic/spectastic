import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '@spectastic/core';
import { decide, effortToDepth, resolveDecider, VOTER_CAP } from '@spectastic/core/decider';
import { describe, expect, it } from 'vitest';

/**
 * Behavioural tests for the Decider (spec 033-decider-effort). They RUN the
 * dispatch and assert observable behaviour — precedence, voter counts, the
 * guardrails — not merely that the code exists (principle P-7).
 */

/** A stub that records each subagent's prompt and returns a scripted risk set. */
class CriticStub implements AIProvider {
  readonly model = 'stub-decider';
  public subagentPrompts: string[] = [];
  public askCalls = 0;

  constructor(private readonly findingsPerCritic: Array<{ target: string; concern: string }[]>) {}

  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    this.askCalls += 1;
    return {} as T;
  }
  async subagent(prompt: string, _o?: SubagentOpts): Promise<SubagentResult> {
    const idx = this.subagentPrompts.length;
    this.subagentPrompts.push(prompt);
    const findings = this.findingsPerCritic[idx] ?? this.findingsPerCritic[0] ?? [];
    return { output: JSON.stringify({ findings }) };
  }
}

const req = (over: Partial<Parameters<typeof decide>[1]> = {}) => ({
  reviewPrompt: 'DRAFT: the authored proposal to judge',
  irreversible: false,
  maxFindings: 3,
  ...over,
});

describe('resolveDecider — precedence (SC-002, FR-002)', () => {
  it('per-run override wins over project config and checkpoint-default', () => {
    const r = resolveDecider({ role: 'agent' }, { role: 'panel' }, 'human');
    expect(r.role).toBe('panel');
  });
  it('project config wins over checkpoint-default when no override', () => {
    const r = resolveDecider({ role: 'panel' }, undefined, 'agent');
    expect(r.role).toBe('panel');
  });
  it('checkpoint-default wins when neither override nor project set', () => {
    const r = resolveDecider(undefined, undefined, 'agent');
    expect(r.role).toBe('agent');
  });
  it('falls back to human when nothing is supplied', () => {
    const r = resolveDecider(undefined, undefined);
    expect(r.role).toBe('human');
    expect(r.effort).toBe('medium');
  });
});

describe('decide — role dispatch (FR-001)', () => {
  it('human skips machine critics entirely and escalates', async () => {
    const ai = new CriticStub([[{ target: 'FR-001', concern: 'x' }]]);
    const v = await decide({ role: 'human', effort: 'high' }, req(), ai);
    expect(ai.subagentPrompts).toHaveLength(0);
    expect(v.voters).toBe(0);
    expect(v.escalatedToHuman).toBe(true);
    expect(v.survivors).toHaveLength(0);
  });
  it('agent runs exactly one critic regardless of effort', async () => {
    const ai = new CriticStub([[{ target: 'FR-001', concern: 'x' }]]);
    const v = await decide({ role: 'agent', effort: 'max' }, req(), ai);
    expect(ai.subagentPrompts).toHaveLength(1);
    expect(v.voters).toBe(1);
    expect(v.survivors).toHaveLength(1);
  });
});

describe('decide — effort sizes the panel (SC-004, FR-004, NFR-001)', () => {
  it('medium → 1, high → 3, max → 5 critics', async () => {
    for (const [effort, n] of [
      ['medium', 1],
      ['high', 3],
      ['max', 5],
    ] as const) {
      const shared = { target: 'FR-001', concern: 'shared risk' };
      const ai = new CriticStub(Array.from({ length: 5 }, () => [shared]));
      const v = await decide({ role: 'panel', effort }, req(), ai);
      expect(ai.subagentPrompts).toHaveLength(n);
      expect(v.voters).toBe(n);
    }
  });
  it('never exceeds the voter cap', () => {
    expect(effortToDepth('max').voters).toBeLessThanOrEqual(VOTER_CAP);
  });
});

describe('decide — categorical arbitration (FR-005)', () => {
  it('a finding survives only with a majority of votes', async () => {
    // 3 critics: FR-001 raised by all 3 (survives), FR-002 by 1 only (culled).
    const ai = new CriticStub([
      [
        { target: 'FR-001', concern: 'a' },
        { target: 'FR-002', concern: 'b' },
      ],
      [{ target: 'FR-001', concern: 'a' }],
      [{ target: 'FR-001', concern: 'a' }],
    ]);
    const v = await decide({ role: 'panel', effort: 'high' }, req(), ai);
    const targets = v.survivors.map((s) => s.target);
    expect(targets).toContain('FR-001');
    expect(targets).not.toContain('FR-002');
    expect(v.tally[0]).toContain('3/3');
  });
});

describe('decide — guardrails (FR-006/007/008, SC-003/005)', () => {
  it('panel critics use DISTINCT lenses, not N identical prompts (FR-007)', async () => {
    const ai = new CriticStub(Array.from({ length: 3 }, () => [{ target: 'FR-001', concern: 'x' }]));
    await decide({ role: 'panel', effort: 'high' }, req(), ai);
    const lensTags = ai.subagentPrompts.map((p) => p.match(/through the (\S+) lens/)?.[1]);
    expect(new Set(lensTags).size).toBe(3); // three distinct lenses
  });
  it('critics judge the DRAFT, never their own output (FR-006/SC-005)', async () => {
    const ai = new CriticStub([[{ target: 'FR-001', concern: 'x' }]]);
    await decide({ role: 'agent', effort: 'medium' }, req({ reviewPrompt: 'AUTHORED-DRAFT-XYZ' }), ai);
    expect(ai.subagentPrompts[0]).toContain('AUTHORED-DRAFT-XYZ');
  });
  it('an irreversible change escalates to human even under panel (FR-008/SC-003)', async () => {
    const ai = new CriticStub([[{ target: 'FR-001', concern: 'x' }]]);
    const v = await decide({ role: 'panel', effort: 'high' }, req({ irreversible: true }), ai);
    expect(v.escalatedToHuman).toBe(true);
  });
});
