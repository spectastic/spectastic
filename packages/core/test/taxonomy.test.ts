import { describe, expect, it } from 'vitest';
import { DECISION_TAXONOMY, answerDecisions } from '@spectastic/core/decider';
import type {
  AIProvider,
  ChatOpts,
  DeciderConfig,
  Question,
  SubagentOpts,
  SubagentResult,
} from '@spectastic/core';

/**
 * 039 — the verb decision taxonomy registry + answerer. Tests RUN the dispatch:
 * the registry mirrors the command markdown (SC-003), answerDecisions routes by
 * role (SC-001/SC-002), and an unlisted verb returns empty without a Decider
 * call (SC-004).
 */

class Stub implements AIProvider {
  readonly model = 'stub-taxonomy';
  public askCalls = 0;
  public subCalls = 0;
  constructor(
    private readonly askAns: Record<string, string> = {},
    private readonly subOut: string[] = [],
  ) {}
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    this.askCalls += 1;
    return this.askAns as T;
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    const out = this.subOut[this.subCalls] ?? this.subOut[0] ?? '{}';
    this.subCalls += 1;
    return { output: out };
  }
}

const AGENT: DeciderConfig = { role: 'agent', effort: 'medium' };
const HUMAN: DeciderConfig = { role: 'human', effort: 'medium' };

describe('DECISION_TAXONOMY — parity with the command markdown (039 SC-003)', () => {
  it('mirrors plan test-style + risk-tolerance labels exactly', () => {
    expect(DECISION_TAXONOMY.plan?.map((q) => q.header)).toEqual(['Test style', 'Risk tolerance']);
    expect(DECISION_TAXONOMY.plan?.[0]?.options.map((o) => o.label)).toEqual([
      'TDD',
      'integration-first',
      'smoke-only',
    ]);
    expect(DECISION_TAXONOMY.plan?.[1]?.options.map((o) => o.label)).toEqual(['Low', 'Medium', 'High']);
  });

  it('mirrors tasks execution-strategy labels exactly', () => {
    expect(DECISION_TAXONOMY.tasks?.[0]?.header).toBe('Execution strategy');
    expect(DECISION_TAXONOMY.tasks?.[0]?.options.map((o) => o.label)).toEqual([
      'MVP-first',
      'Incremental',
      'Parallel teams',
    ]);
  });

  it('has no entry for context-dependent verbs (spec)', () => {
    expect(DECISION_TAXONOMY.spec).toBeUndefined();
  });
});

describe('answerDecisions — role dispatch (039 SC-001/SC-002)', () => {
  it('answers plan decisions via the agent decider (SC-001)', async () => {
    const stub = new Stub({}, ['{"Test style":"TDD","Risk tolerance":"Low"}']);
    const res = await answerDecisions('plan', AGENT, stub);
    expect(res['Test style']).toBe('TDD');
    expect(res['Risk tolerance']).toBe('Low');
    expect(stub.subCalls).toBeGreaterThan(0);
    expect(stub.askCalls).toBe(0);
  });

  it('answers tasks execution-strategy via the agent decider (SC-001)', async () => {
    const stub = new Stub({}, ['{"Execution strategy":"Incremental"}']);
    const res = await answerDecisions('tasks', AGENT, stub);
    expect(res['Execution strategy']).toBe('Incremental');
  });

  it('routes to ai.ask at role human — interview parity (SC-002)', async () => {
    const stub = new Stub({ 'Test style': 'TDD', 'Risk tolerance': 'Medium' }, []);
    const res = await answerDecisions('plan', HUMAN, stub);
    expect(stub.askCalls).toBe(1);
    expect(stub.subCalls).toBe(0);
    expect(res['Risk tolerance']).toBe('Medium');
  });

  it('returns empty for a context-dependent verb, no Decider call (SC-004)', async () => {
    const stub = new Stub({}, []);
    expect(await answerDecisions('spec', AGENT, stub)).toEqual({});
    expect(stub.subCalls).toBe(0);
    expect(stub.askCalls).toBe(0);
  });

  it('returns empty for an unknown verb', async () => {
    const stub = new Stub({}, []);
    expect(await answerDecisions('nope', AGENT, stub)).toEqual({});
  });
});
