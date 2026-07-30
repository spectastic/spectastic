import { describe, expect, it } from 'vitest';
import { planCommand } from '../src/commands/plan.js';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../src/types.js';

/**
 * 037 FR-005 — the run threads answered decisions into plan generation. A
 * recording stub asserts the decisions reach the generation prompt, and that an
 * absent-decisions call is byte-parity (no decisions line) — the additive
 * guarantee (D-002 / NFR-001 of 037).
 */

class RecordChat implements AIProvider {
  readonly model = 'rec';
  public prompts: string[] = [];
  async chat(p: string, _o?: ChatOpts): Promise<string> {
    this.prompts.push(p);
    return '{"approach":"a","decisions":[],"alternatives":[],"risks":[],"principles":[]}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    return {} as T;
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    return { output: '{}' };
  }
}

// A minimal spec with no estimability blockers.
const SPEC =
  '<!doctype html><html lang="en"><body><main><spec-requirement id="FR-001" priority="must"><p>do a thing.</p></spec-requirement></main></body></html>';

describe('planCommand — decisions threading (037 FR-005)', () => {
  it('folds the answered decisions into the generation prompt', async () => {
    const ai = new RecordChat();
    await planCommand(
      {
        specId: 'x',
        specHtml: SPEC,
        decisions: { 'Test style': 'TDD', 'Risk tolerance': 'Low' },
      },
      { cwd: '.', ai },
    );
    expect(ai.prompts[0]).toContain('Decisions already made');
    expect(ai.prompts[0]).toContain('Test style: TDD');
    expect(ai.prompts[0]).toContain('Risk tolerance: Low');
  });

  it('is parity when decisions are absent — no decisions line', async () => {
    const ai = new RecordChat();
    await planCommand({ specId: 'x', specHtml: SPEC }, { cwd: '.', ai });
    expect(ai.prompts[0]).not.toContain('Decisions already made');
  });
});
