import type { AIProvider, KernelContext, Question, SubagentOpts, SubagentResult } from '../src/types.js';
import { designCommand } from '../src/commands/design.js';
import { describe, expect, it, vi } from 'vitest';

/**
 * T-112 (072-contract-embedded-view): designCommand must call the
 * materialiser over the html it renders. renderDesignHtml's current template
 * never emits a <spec-contract> itself (materialise-view.test.ts covers the
 * materialiser's own behaviour exhaustively against real declarations), so
 * this test proves the WIRING — the call happens, with the rendered html and
 * ctx's fs/cwd — via a spy on the materialiser module, rather than asserting
 * on a contract declaration this template doesn't produce today.
 */

vi.mock('../src/contracts/materialise-view.js', async () => {
  const actual = await vi.importActual<typeof import('../src/contracts/materialise-view.js')>(
    '../src/contracts/materialise-view.js',
  );
  return {
    ...actual,
    materialiseContractViews: vi.fn(actual.materialiseContractViews),
  };
});

class StubAI implements AIProvider {
  async chat(): Promise<string> {
    return JSON.stringify({ approach: 'x', decisions: [], alternatives: [], risks: [], principles: [] });
  }
  async ask<TResult extends Record<string, string>>(_questions: ReadonlyArray<Question>): Promise<TResult> {
    throw new Error('not used');
  }
  async subagent(_prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('not used');
  }
}

describe('designCommand — contract view materialisation wiring (072, T-112)', () => {
  it('calls materialiseContractViews over the rendered html and returns its result', async () => {
    const { materialiseContractViews } = await import('../src/contracts/materialise-view.js');
    const ctx: KernelContext = { cwd: '/repo', ai: new StubAI() };

    const result = await designCommand({ specId: '900-test', specHtml: '<html></html>' }, ctx);

    expect(materialiseContractViews).toHaveBeenCalledTimes(1);
    const call = vi.mocked(materialiseContractViews).mock.calls[0]!;
    expect(call[0]).toContain('<title>900-test'); // the html designCommand rendered
    expect(call[2]).toBe('/repo'); // ctx.cwd threaded through
    expect(result.html).toBe(call[0]); // no <spec-contract> present — materialiser is a passthrough
  });
});
