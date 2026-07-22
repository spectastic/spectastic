import { describe, expect, it } from 'vitest';
import { planCommand } from '@spectastic/core/commands/plan';
import type {
  AIProvider,
  ChatOpts,
  KernelContext,
  PlanInput,
  Question,
  SubagentOpts,
  SubagentResult,
} from '@spectastic/core';

/**
 * Unit tests for planCommand. Stub AIProvider; no network; no
 * filesystem. Covers the estimability gate (three blocker shapes), the
 * happy-path JSON contract, the principles-violation guard, the
 * re-entry prompt shape, and the ctx.ai precondition.
 */

interface StubChatResponse {
  json?: Record<string, unknown>;
  raw?: string;
}

class StubAI implements AIProvider {
  public chatCalls = 0;
  public lastPrompt: string | null = null;
  public lastOpts: ChatOpts | undefined = undefined;

  constructor(private readonly chatResponses: StubChatResponse[] = []) {}

  async chat(prompt: string, opts?: ChatOpts): Promise<string> {
    this.lastPrompt = prompt;
    this.lastOpts = opts;
    const response = this.chatResponses[this.chatCalls];
    this.chatCalls += 1;
    if (!response) throw new Error(`StubAI: no chat response for call ${this.chatCalls}`);
    if (response.raw !== undefined) return response.raw;
    return JSON.stringify(response.json ?? {});
  }

  async ask<TResult extends Record<string, string>>(
    _questions: ReadonlyArray<Question>,
  ): Promise<TResult> {
    throw new Error('StubAI.ask: not used in plan tests');
  }

  async subagent(_prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('StubAI.subagent: not used in plan tests');
  }
}

const ctxFrom = (ai: AIProvider): KernelContext => ({ cwd: '/tmp/test', ai });

const CLEAN_SPEC = `<!doctype html><html><body>
<p class="small-caps">Specification · 099-clean</p>
<spec-requirement id="FR-001" priority="must"><p>Do the thing.</p></spec-requirement>
</body></html>`;

const baseInput = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  specId: '099-clean',
  specHtml: CLEAN_SPEC,
  ...overrides,
});

describe('planCommand (012)', () => {
  it('estimability gate refuses on open <spec-question>', async () => {
    const ai = new StubAI();
    const specHtml = `<!doctype html><html><body>
<spec-questions><ol><li>What should X do when Y?</li></ol></spec-questions>
</body></html>`;

    const result = await planCommand(baseInput({ specHtml }), ctxFrom(ai));

    expect(result.html).toBe('');
    expect(result.decisionsCount).toBe(0);
    expect(result.estimabilityBlockers).toContain('open <spec-question>');
    expect(ai.chatCalls).toBe(0);
  });

  it('estimability gate refuses on [NEEDS CLARIFICATION] marker', async () => {
    const ai = new StubAI();
    const specHtml = `<!doctype html><html><body>
<p>The latency budget is [NEEDS CLARIFICATION: target ms?].</p>
</body></html>`;

    const result = await planCommand(baseInput({ specHtml }), ctxFrom(ai));

    expect(result.html).toBe('');
    expect(result.decisionsCount).toBe(0);
    expect(result.estimabilityBlockers).toContain('[NEEDS CLARIFICATION]');
    expect(ai.chatCalls).toBe(0);
  });

  it('estimability gate refuses on out-of-scope item missing defer-to', async () => {
    const ai = new StubAI();
    const specHtml = `<!doctype html><html><body>
<spec-out-of-scope><ul><li>Dark mode polish</li></ul></spec-out-of-scope>
</body></html>`;

    const result = await planCommand(baseInput({ specHtml }), ctxFrom(ai));

    expect(result.html).toBe('');
    expect(result.decisionsCount).toBe(0);
    expect(result.estimabilityBlockers).toContain('missing defer-to');
    expect(ai.chatCalls).toBe(0);
  });

  it('happy path: returns rendered html with decision + principles counts', async () => {
    const ai = new StubAI([
      {
        json: {
          approach: 'Layered approach: parser → renderer → CLI shim.',
          decisions: [
            {
              id: 'D-001',
              title: 'Use a recursive-descent parser',
              context: 'Inputs are small and bounded.',
              decision: 'Hand-rolled recursive descent.',
              consequences: 'Easy to debug; no generator dependency.',
            },
            {
              id: 'D-002',
              title: 'Render to string, never DOM',
              context: 'Kernel must run in non-browser hosts.',
              decision: 'Pure string templating.',
              consequences: 'No jsdom dependency.',
            },
          ],
          alternatives: [
            { name: 'PEG.js', scores: [3, 4, 2], isWinner: false },
            { name: 'Recursive descent', scores: [5, 5, 5], isWinner: true },
          ],
          risks: [{ risk: 'parser drift', mitigation: 'golden fixtures' }],
          principles: [
            { id: 'P-1', status: 'OK', note: 'single-file artifact preserved' },
            { id: 'P-2', status: 'OK', note: 'no per-surface duplication' },
            { id: 'P-3', status: 'EXCEPTION', note: 'minor scope creep, justified' },
          ],
        },
      },
    ]);

    const result = await planCommand(baseInput(), ctxFrom(ai));

    expect(ai.chatCalls).toBe(1);
    expect(result.estimabilityBlockers).toEqual([]);
    expect(result.decisionsCount).toBe(2);
    expect(result.principlesCheck).toEqual({ ok: 2, exceptions: 1, violations: 0 });
    expect(result.html).toContain('099-clean');
    expect(result.html).toContain('D-001');
    expect(result.html).toContain('D-002');
    expect(result.html).toContain('Initial plan via planCommand');
    // 045-artifact-security T-102: the kernel's own generated <head> carries the
    // open-time CSP gate too, not just the file-based templates/plan.html.
    expect(result.html).toContain('Content-Security-Policy');
  });

  it('throws when AI marks any principle as VIOLATION', async () => {
    const ai = new StubAI([
      {
        json: {
          approach: 'Approach.',
          decisions: [
            {
              id: 'D-001',
              title: 't',
              context: 'c',
              decision: 'd',
              consequences: 'x',
            },
          ],
          alternatives: [],
          risks: [],
          principles: [
            { id: 'P-1', status: 'OK', note: 'fine' },
            { id: 'P-2', status: 'VIOLATION', note: 'breaks single-file rule' },
          ],
        },
      },
    ]);

    await expect(planCommand(baseInput(), ctxFrom(ai))).rejects.toThrow(
      /1 principle\(s\) marked VIOLATION/,
    );
  });

  it('re-entry mode: prompt includes "Sharpen this plan" and changelog reflects re-entry', async () => {
    const ai = new StubAI([
      {
        json: {
          approach: 'Sharpened approach.',
          decisions: [
            { id: 'D-003', title: 'New decision', context: 'c', decision: 'd', consequences: 'x' },
          ],
          alternatives: [],
          risks: [],
          principles: [{ id: 'P-1', status: 'OK', note: 'still fine' }],
        },
      },
    ]);

    const existingPlan = `<!doctype html><html><body>
<spec-decision id="D-001"><h4>D-001 · Existing</h4></spec-decision>
</body></html>`;

    const result = await planCommand(
      baseInput({ existingPlan }),
      ctxFrom(ai),
    );

    expect(ai.lastPrompt).toContain('Sharpen this plan');
    expect(ai.lastPrompt).toContain('ADD or ENHANCE only');
    expect(result.html).toContain('Re-entry via planCommand');
    expect(result.decisionsCount).toBe(1);
  });

  it('throws when ctx.ai is undefined', async () => {
    await expect(
      planCommand(baseInput(), { cwd: '/tmp/test' }),
    ).rejects.toThrow(/planCommand requires ctx\.ai/);
  });
});
