import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '@spectastic/core';
import { CRITERION_LENSES, gradeCriteria, gradeCriterion } from '@spectastic/core/decider';
import { describe, expect, it } from 'vitest';

/**
 * Behavioural tests for the two graded success-criteria judgments
 * (108-success-criteria FR-014, T-903). They RUN the wrapper over a stub
 * AIProvider and assert observable behaviour — which lens each call carries,
 * that findings are advisory data (never a thrown gate), and that an id-less
 * finding falls back to the criterion it judged.
 */

/** A stub that records every subagent prompt and returns a scripted finding set. */
class GradeStub implements AIProvider {
  readonly model = 'stub-grader';
  public subagentPrompts: string[] = [];

  constructor(private readonly findingsPerCall: Array<{ target: string; concern: string }[]>) {}

  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    return {} as T;
  }
  async subagent(prompt: string, _o?: SubagentOpts): Promise<SubagentResult> {
    const idx = this.subagentPrompts.length;
    this.subagentPrompts.push(prompt);
    const findings = this.findingsPerCall[idx] ?? this.findingsPerCall[0] ?? [];
    return { output: JSON.stringify({ findings }) };
  }
}

describe('gradeCriterion (FR-014)', () => {
  it('judges through the requested lens and tags the finding with it', async () => {
    const ai = new GradeStub([[{ target: 'SC-001', concern: 'actor is "the verb"' }]]);
    const findings = await gradeCriterion(ai, { id: 'SC-001', text: 'The verb exits 0.' }, 'stakeholder-vocabulary');
    expect(findings).toEqual([{ target: 'SC-001', concern: 'actor is "the verb"', lens: 'stakeholder-vocabulary' }]);
    expect(ai.subagentPrompts[0]).toContain('stakeholder-vocabulary');
    expect(ai.subagentPrompts[0]).toContain('SC-001');
  });

  it('falls back to the criterion id when a finding carries no target', async () => {
    const ai = new GradeStub([[{ target: '', concern: 'restates FR-002 verbatim' }]]);
    const findings = await gradeCriterion(ai, { id: 'SC-002', text: 'x' }, 'test-satisfiability');
    expect(findings[0]?.target).toBe('SC-002');
  });

  it('returns an empty array — a legitimate result — when the critic finds nothing', async () => {
    const ai = new GradeStub([[]]);
    const findings = await gradeCriterion(ai, { id: 'SC-003', text: 'x' }, 'stakeholder-vocabulary');
    expect(findings).toEqual([]);
  });
});

describe('gradeCriteria (FR-014)', () => {
  it('runs both lenses per criterion — one subagent call per (criterion, lens) pair', async () => {
    const ai = new GradeStub([[], [], [], []]);
    await gradeCriteria(ai, [
      { id: 'SC-001', text: 'a' },
      { id: 'SC-002', text: 'b' },
    ]);
    expect(ai.subagentPrompts).toHaveLength(2 * CRITERION_LENSES.length);
  });

  it('flattens findings across every criterion and lens', async () => {
    const ai = new GradeStub([
      [{ target: 'SC-001', concern: 'tool-internal actor' }],
      [],
      [],
      [{ target: 'SC-002', concern: 'restates its requirement' }],
    ]);
    const findings = await gradeCriteria(ai, [
      { id: 'SC-001', text: 'a' },
      { id: 'SC-002', text: 'b' },
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.target).sort()).toEqual(['SC-001', 'SC-002']);
  });

  it('is advisory data only — never throws, regardless of what the critics find', async () => {
    const ai = new GradeStub([
      [{ target: 'SC-001', concern: 'concern one' }],
      [{ target: 'SC-001', concern: 'concern two' }],
    ]);
    await expect(gradeCriteria(ai, [{ id: 'SC-001', text: 'a' }])).resolves.toBeInstanceOf(Array);
  });
});
