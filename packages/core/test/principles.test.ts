import { describe, expect, it } from 'vitest';
import { principlesCommand } from '@spectastic/core/commands/principles';
import type {
  AIProvider,
  ChatOpts,
  KernelContext,
  Question,
  SubagentOpts,
  SubagentResult,
} from '@spectastic/core';

class StubAI implements AIProvider {
  constructor(private readonly response: string) {}
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return this.response;
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    throw new Error('not used in principles tests');
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('not used');
  }
}

const ctxWith = (ai: AIProvider): KernelContext => ({ cwd: '/tmp', ai });

describe('principlesCommand (008 FR-* via spec)', () => {
  it('generates HTML from valid AI JSON response with default count of 5', async () => {
    const ai = new StubAI(
      JSON.stringify({
        principles: [
          { shortLabel: 'Source order is reading order', body: 'Body 1.' },
          { shortLabel: 'Semantic tags over class soup', body: 'Body 2.' },
          { shortLabel: 'IDs are contracts', body: 'Body 3.' },
          { shortLabel: 'Progressive enhancement', body: 'Body 4.' },
          { shortLabel: 'Calm density', body: 'Body 5.' },
        ],
      }),
    );
    const result = await principlesCommand({ projectName: 'spectastic' }, ctxWith(ai));

    expect(result.principlesCount).toBe(5);
    expect(result.html).toContain('<title>spectastic · Principles</title>');
    expect(result.html).toContain('P-1 · Source order is reading order');
    expect(result.html).toContain('P-5 · Calm density');
  });

  it('throws on AI returning non-JSON', async () => {
    const ai = new StubAI('not json at all');
    await expect(
      principlesCommand({ projectName: 'x' }, ctxWith(ai)),
    ).rejects.toThrow(/non-JSON/);
  });

  it('throws on missing principles array', async () => {
    const ai = new StubAI(JSON.stringify({ other: 'thing' }));
    await expect(
      principlesCommand({ projectName: 'x' }, ctxWith(ai)),
    ).rejects.toThrow(/missing "principles" array/);
  });

  it('honours custom count parameter', async () => {
    const ai = new StubAI(
      JSON.stringify({
        principles: [
          { shortLabel: 'A', body: 'body a' },
          { shortLabel: 'B', body: 'body b' },
          { shortLabel: 'C', body: 'body c' },
        ],
      }),
    );
    const result = await principlesCommand(
      { projectName: 'x', principlesCount: 3 },
      ctxWith(ai),
    );
    expect(result.principlesCount).toBe(3);
  });

  it('throws when ctx.ai is undefined', async () => {
    await expect(
      principlesCommand({ projectName: 'x' }, { cwd: '/tmp' }),
    ).rejects.toThrow(/ctx\.ai/);
  });
});
