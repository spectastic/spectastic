import type {
  AIProvider,
  ChatOpts,
  KernelContext,
  PlanInput,
  Question,
  SubagentOpts,
  SubagentResult,
} from '@spectastic/core';
import { planCommand } from '@spectastic/core/commands/plan';
import { describe, expect, it } from 'vitest';

/**
 * Re-entry coverage for planCommand (012-core-plan, T-200 / FR-006).
 *
 * The discrete re-entry acceptance gate: given an existing plan carrying
 * decisions, a re-entry run must preserve those D-NNN and append the new ones.
 *
 * Contract note (verified against the implementation, not the plan's original
 * intent): ID assignment is AI-driven, not kernel-side. planCommand renders
 * exactly the `decisions` array the model returns and instructs preservation via
 * the "Sharpen this plan. ADD or ENHANCE only; never remove existing ADRs"
 * prompt — there is no `maxId+1` counter in the kernel (plan.ts:107 renders
 * `parsed.decisions` verbatim). So this test drives a stub returning the
 * preserved-plus-appended set the model is asked to produce, and asserts (a) the
 * re-entry prompt is correctly formed to demand preservation and carries the
 * existing plan, and (b) the kernel renders every returned decision faithfully,
 * old and new, and marks the changelog as re-entry.
 */

interface StubChatResponse {
  json?: Record<string, unknown>;
  raw?: string;
}

class StubAI implements AIProvider {
  public chatCalls = 0;
  public lastPrompt: string | null = null;

  constructor(private readonly chatResponses: StubChatResponse[] = []) {}

  async chat(prompt: string, _opts?: ChatOpts): Promise<string> {
    this.lastPrompt = prompt;
    const response = this.chatResponses[this.chatCalls];
    this.chatCalls += 1;
    if (!response) throw new Error(`StubAI: no chat response for call ${this.chatCalls}`);
    if (response.raw !== undefined) return response.raw;
    return JSON.stringify(response.json ?? {});
  }

  async ask<TResult extends Record<string, string>>(_questions: ReadonlyArray<Question>): Promise<TResult> {
    throw new Error('StubAI.ask: not used in plan re-entry tests');
  }

  async subagent(_prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('StubAI.subagent: not used in plan re-entry tests');
  }
}

const ctxFrom = (ai: AIProvider): KernelContext => ({ cwd: '/tmp/test', ai });

const CLEAN_SPEC = `<!doctype html><html><body>
<p class="small-caps">Specification · 099-clean</p>
<spec-requirement id="FR-001" priority="must"><p>Do the thing.</p></spec-requirement>
</body></html>`;

// A fixture plan that already carries two decisions — the max existing id is D-002.
const EXISTING_PLAN = `<!doctype html><html><body>
<spec-decision id="D-001"><h4>D-001 · Storage engine</h4><dl><dt>Decision</dt><dd>Use SQLite.</dd></dl></spec-decision>
<spec-decision id="D-002"><h4>D-002 · Auth strategy</h4><dl><dt>Decision</dt><dd>Session cookies.</dd></dl></spec-decision>
</body></html>`;

const baseInput = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  specId: '099-clean',
  specHtml: CLEAN_SPEC,
  ...overrides,
});

describe('planCommand re-entry (012 T-200, FR-006)', () => {
  it('forms a preservation prompt that carries the existing plan', async () => {
    const ai = new StubAI([
      {
        json: {
          approach: 'Sharpened.',
          decisions: [
            {
              id: 'D-001',
              title: 'Storage engine',
              context: 'c',
              decision: 'Use SQLite.',
              consequences: 'x',
            },
            {
              id: 'D-002',
              title: 'Auth strategy',
              context: 'c',
              decision: 'Session cookies.',
              consequences: 'x',
            },
            {
              id: 'D-003',
              title: 'Caching layer',
              context: 'c',
              decision: 'Add an LRU.',
              consequences: 'x',
            },
          ],
          alternatives: [],
          risks: [],
          principles: [{ id: 'P-1', status: 'OK', note: 'fine' }],
        },
      },
    ]);

    await planCommand(baseInput({ existingPlan: EXISTING_PLAN }), ctxFrom(ai));

    expect(ai.lastPrompt).toContain('Sharpen this plan');
    expect(ai.lastPrompt).toContain('ADD or ENHANCE only');
    expect(ai.lastPrompt).toContain('never remove existing ADRs');
    // the existing plan's decisions are handed to the model so it can preserve them
    expect(ai.lastPrompt).toContain('D-001');
    expect(ai.lastPrompt).toContain('D-002');
  });

  it('preserves the existing D-NNN and appends the new decision, all rendered', async () => {
    const ai = new StubAI([
      {
        json: {
          approach: 'Sharpened.',
          decisions: [
            {
              id: 'D-001',
              title: 'Storage engine',
              context: 'c',
              decision: 'Use SQLite.',
              consequences: 'x',
            },
            {
              id: 'D-002',
              title: 'Auth strategy',
              context: 'c',
              decision: 'Session cookies.',
              consequences: 'x',
            },
            {
              id: 'D-003',
              title: 'Caching layer',
              context: 'c',
              decision: 'Add an LRU.',
              consequences: 'x',
            },
          ],
          alternatives: [],
          risks: [],
          principles: [{ id: 'P-1', status: 'OK', note: 'fine' }],
        },
      },
    ]);

    const result = await planCommand(baseInput({ existingPlan: EXISTING_PLAN }), ctxFrom(ai));

    // preservation: both existing decisions survive into the rendered plan
    expect(result.html).toContain('id="D-001"');
    expect(result.html).toContain('id="D-002"');
    expect(result.html).toContain('Storage engine');
    expect(result.html).toContain('Auth strategy');
    // append: the new decision, continuing from the existing max id (D-002 → D-003)
    expect(result.html).toContain('id="D-003"');
    expect(result.html).toContain('Caching layer');
    // the count reflects the full preserved-plus-appended set
    expect(result.decisionsCount).toBe(3);
    // the changelog records this as a re-entry, not an initial authoring
    expect(result.html).toContain('Re-entry via planCommand');
  });

  it('a re-entry that only enhances (no new decision) still renders the preserved set', async () => {
    const ai = new StubAI([
      {
        json: {
          approach: 'Enhanced wording only.',
          decisions: [
            {
              id: 'D-001',
              title: 'Storage engine',
              context: 'sharpened context',
              decision: 'Use SQLite (WAL mode).',
              consequences: 'x',
            },
            {
              id: 'D-002',
              title: 'Auth strategy',
              context: 'c',
              decision: 'Session cookies.',
              consequences: 'x',
            },
          ],
          alternatives: [],
          risks: [],
          principles: [{ id: 'P-1', status: 'OK', note: 'fine' }],
        },
      },
    ]);

    const result = await planCommand(baseInput({ existingPlan: EXISTING_PLAN }), ctxFrom(ai));

    expect(result.decisionsCount).toBe(2);
    expect(result.html).toContain('id="D-001"');
    expect(result.html).toContain('Use SQLite (WAL mode).'); // the enhancement landed
    expect(result.html).toContain('id="D-002"');
    expect(result.html).toContain('Re-entry via planCommand');
  });

  it('fresh mode (no existing plan) is the initial-authoring path, not re-entry', async () => {
    const ai = new StubAI([
      {
        json: {
          approach: 'Fresh.',
          decisions: [
            {
              id: 'D-001',
              title: 'First',
              context: 'c',
              decision: 'd',
              consequences: 'x',
            },
          ],
          alternatives: [],
          risks: [],
          principles: [{ id: 'P-1', status: 'OK', note: 'fine' }],
        },
      },
    ]);

    const result = await planCommand(baseInput(), ctxFrom(ai));

    expect(ai.lastPrompt).toContain('Author an implementation plan');
    expect(ai.lastPrompt).not.toContain('Sharpen this plan');
    expect(result.html).toContain('Initial plan via planCommand');
  });
});
