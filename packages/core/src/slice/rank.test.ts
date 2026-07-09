import { describe, expect, it } from 'vitest';
import { confirmRice } from './rank.js';
import type { CandidateChild } from './types.js';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../types.js';

/**
 * confirmRice routes its Accept/Adjust gate through the Decider (spec 036).
 * Default human = the prior ai.ask behaviour (parity); an agent decider answers
 * via a distinct subagent — the no-self-judging guardrail (SC-003).
 */

function child(specId: string): CandidateChild {
  return {
    specId,
    title: specId,
    scope: '',
    assignedRequirementIds: [],
    dependsOn: [],
    rice: { reach: 1, impact: 1, confidence: 1, effort: 1 },
    riceConfirmed: false,
  };
}

class Stub implements AIProvider {
  readonly model = 'stub';
  public askCalls = 0;
  public subCalls = 0;
  constructor(
    private readonly askAns: Record<string, string> = {},
    private readonly subOut = '{"RICE":"Accept"}',
  ) {}
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    this.askCalls += 1;
    return this.askAns as T;
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    this.subCalls += 1;
    return { output: this.subOut };
  }
}

describe('confirmRice · decider routing (036)', () => {
  it('default human calls ai.ask and confirms on Accept (parity, SC-002)', async () => {
    const ai = new Stub({ RICE: 'Accept' });
    const out = await confirmRice([child('001-a')], { cwd: '.', ai });
    expect(ai.askCalls).toBe(1);
    expect(ai.subCalls).toBe(0);
    expect(out[0]!.riceConfirmed).toBe(true);
  });

  it('human Adjust leaves the child provisional (parity)', async () => {
    const ai = new Stub({ RICE: 'Adjust' });
    const out = await confirmRice([child('001-a')], { cwd: '.', ai });
    expect(out[0]!.riceConfirmed).toBe(false);
  });

  it('an agent decider answers via a distinct subagent — no self-judging (SC-003)', async () => {
    const ai = new Stub({}, '{"RICE":"Accept"}');
    const out = await confirmRice([child('001-a')], { cwd: '.', ai }, { role: 'agent', effort: 'medium' });
    expect(ai.subCalls).toBe(1);
    expect(ai.askCalls).toBe(0);
    expect(out[0]!.riceConfirmed).toBe(true);
  });
});
