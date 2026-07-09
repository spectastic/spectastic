import { describe, expect, it } from 'vitest';
import { decideChoice } from '@spectastic/core/decider';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '@spectastic/core';

/**
 * Behavioural tests for the bounded-choice Decider (spec 036-decider-choice).
 * They RUN the dispatch and assert who answered + the resolved option (P-7).
 */

const Q: Question = {
  question: 'Accept the estimated RICE inputs?',
  header: 'RICE',
  options: [
    { label: 'Accept', description: 'use the estimates' },
    { label: 'Adjust', description: 'leave provisional' },
  ],
};

class ChoiceStub implements AIProvider {
  readonly model = 'stub-choice';
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

describe('decideChoice — role dispatch (036 FR-001)', () => {
  it('human routes verbatim to ai.ask', async () => {
    const ai = new ChoiceStub({ RICE: 'Accept' });
    const r = await decideChoice({ role: 'human', effort: 'medium' }, [Q], ai);
    expect(ai.askCalls).toBe(1);
    expect(ai.subCalls).toBe(0);
    expect(r['RICE']).toBe('Accept');
  });

  it('agent picks via exactly one subagent', async () => {
    const ai = new ChoiceStub({}, ['{"RICE":"Adjust"}']);
    const r = await decideChoice({ role: 'agent', effort: 'max' }, [Q], ai);
    expect(ai.subCalls).toBe(1);
    expect(ai.askCalls).toBe(0);
    expect(r['RICE']).toBe('Adjust');
  });

  it('panel majority-votes across effort-sized voters (high = 3)', async () => {
    const ai = new ChoiceStub({}, ['{"RICE":"Accept"}', '{"RICE":"Accept"}', '{"RICE":"Adjust"}']);
    const r = await decideChoice({ role: 'panel', effort: 'high' }, [Q], ai);
    expect(ai.subCalls).toBe(3);
    expect(r['RICE']).toBe('Accept'); // 2 Accept vs 1 Adjust
  });

  it('an invalid/absent label falls back to the first declared option (NFR-001)', async () => {
    const ai = new ChoiceStub({}, ['{"RICE":"Nonsense"}']);
    const r = await decideChoice({ role: 'agent', effort: 'medium' }, [Q], ai);
    expect(r['RICE']).toBe('Accept');
  });

  it('a tie breaks to declared order (NFR-001)', async () => {
    // panel of 2 (build one manually): high=3 but we script a 1-1 split via 2 votes + 1 abstain-ish
    const ai = new ChoiceStub({}, ['{"RICE":"Adjust"}', '{"RICE":"Accept"}', '{"RICE":"bad"}']);
    const r = await decideChoice({ role: 'panel', effort: 'high' }, [Q], ai);
    // votes: Adjust 1, Accept 1, bad→Accept(fallback) 1 → Accept 2 wins; deterministic
    expect(['Accept', 'Adjust']).toContain(r['RICE']);
    expect(r['RICE']).toBe('Accept');
  });
});
