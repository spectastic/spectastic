import type { AIProvider, ChatOpts, KernelContext, Question, SubagentOpts, SubagentResult } from '@spectastic/core';
import { triageCommand } from '@spectastic/core/commands/triage';
import { describe, expect, it } from 'vitest';

/**
 * Unit tests for triageCommand. Per FR-010 + FR-011 of
 * specs/007-core-triage/spec.html: stub AIProvider; no network; no
 * filesystem. Also exercises SC-003 (subpath import works without
 * process spawn).
 */

interface StubChatResponse {
  json: Record<string, unknown>;
}

class StubAI implements AIProvider {
  public chatCalls = 0;
  public askCalls: Question[][] = [];

  constructor(
    private readonly chatResponses: StubChatResponse[],
    private readonly askResponses: Record<string, string>[] = [],
  ) {}

  async chat(_prompt: string, _opts?: ChatOpts): Promise<string> {
    const response = this.chatResponses[this.chatCalls];
    this.chatCalls += 1;
    if (!response) throw new Error(`StubAI: no chat response for call ${this.chatCalls}`);
    return JSON.stringify(response.json);
  }

  async ask<TResult extends Record<string, string>>(questions: ReadonlyArray<Question>): Promise<TResult> {
    this.askCalls.push([...questions]);
    const response = this.askResponses[this.askCalls.length - 1];
    if (!response) throw new Error('StubAI: no ask response staged');
    return response as TResult;
  }

  async subagent(_prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('StubAI.subagent: not used in 007 tests');
  }
}

const ctxFrom = (ai: AIProvider): KernelContext => ({ cwd: '/tmp/test', ai });

describe('triageCommand (007 FR-004, FR-005, FR-009, FR-010, FR-011)', () => {
  it('single-card mode returns one TriageCard with sequential T-NNN id', async () => {
    const ai = new StubAI([
      {
        json: {
          headline: 'session expiry never fires',
          layer: 'implementation',
          layerConfidence: 'high',
          expected: 'Session expires after 30 min idle.',
          actual: 'Session never expires.',
          diagnosis: 'src/auth/session.ts setTimeout never armed; code drift.',
          fix: 'src/auth/session.ts — arm setTimeout on session.touch().',
          regenResult: 'pass',
        },
      },
    ]);
    const result = await triageCommand(
      {
        description: 'Sessions never expire even after 30 min idle.',
        mode: 'single',
        specId: '001-auth',
        startingIdT: 4,
        startingIdI: 0,
      },
      ctxFrom(ai),
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.id).toBe('T-005');
    expect(result.cards[0]?.layer).toBe('implementation');
    expect(result.cards[0]?.regenResult).toBe('pass');
    expect(ai.chatCalls).toBe(1);
  });

  it('list-intake mode produces one card per item with mixed T-/I- prefixes', async () => {
    const ai = new StubAI([
      {
        json: {
          headline: 'typo on principles.html line 42',
          layer: 'just-do',
          layerConfidence: 'high',
          expected: 'no typo',
          actual: 'typo present',
          diagnosis: 'small docs slip',
          fix: 'principles.html line 42 — fix typo',
        },
      },
      {
        json: {
          headline: 'dark-mode polish backlog',
          layer: 'defer',
          layerConfidence: 'high',
          expected: 'polished dark mode',
          actual: 'rough dark mode',
          diagnosis: 'theme pass deferred',
          fix: 'theme system; defer-to=TBD-theme-pass',
          deferTo: 'TBD-theme-pass',
        },
      },
      {
        json: {
          headline: 'add export-to-PDF',
          layer: 'spec',
          layerConfidence: 'high',
          expected: 'PDF export available',
          actual: 'no PDF export',
          diagnosis: 'missing requirement',
          fix: 'new feature spec for export',
          regenResult: 'fail',
        },
      },
    ]);

    const result = await triageCommand(
      {
        description:
          '- typo on principles.html line 42\n- dark-mode polish (defer-to=TBD-theme-pass)\n- add export-to-PDF (needs its own spec)',
        mode: 'list',
        startingIdI: 4,
        startingIdT: 2,
      },
      ctxFrom(ai),
    );

    expect(result.cards).toHaveLength(3);
    const ids = result.cards.map((c) => c.id);
    expect(ids).toEqual(['I-005', 'I-006', 'T-003']);
    expect(result.cards[0]?.layer).toBe('just-do');
    expect(result.cards[1]?.layer).toBe('defer');
    expect(result.cards[2]?.layer).toBe('spec');
  });

  it('escalates layer classification via ask<T>() when confidence is low', async () => {
    const ai = new StubAI(
      [
        {
          json: {
            headline: 'mystery failure',
            layer: 'spec',
            layerConfidence: 'low',
            expected: 'works',
            actual: 'fails',
            diagnosis: 'unclear root cause',
            fix: 'unclear',
            regenResult: 'unsure',
          },
        },
      ],
      [{ category: 'diagnostic' }, { layer: 'implementation' }],
    );

    const result = await triageCommand(
      { description: 'mystery failure', mode: 'single', specId: '001-x' },
      ctxFrom(ai),
    );

    expect(result.cards[0]?.layer).toBe('implementation');
    expect(ai.askCalls).toHaveLength(2);
    expect(ai.askCalls[0]?.[0]?.header).toBe('category');
    expect(ai.askCalls[1]?.[0]?.header).toBe('layer');
  });

  it('throws when ctx.ai is undefined', async () => {
    await expect(triageCommand({ description: 'x', mode: 'single' }, { cwd: '/tmp' })).rejects.toThrow(
      /triageCommand requires ctx\.ai/,
    );
  });
});
