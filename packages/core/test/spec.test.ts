import { describe, expect, it } from 'vitest';
import { specCommand } from '@spectastic/core/commands/spec';
import type {
  AIProvider,
  ChatOpts,
  KernelContext,
  Question,
  SubagentOpts,
  SubagentResult,
} from '@spectastic/core';

/**
 * Unit tests for specCommand. Per the 011-core-spec contract: stub
 * AIProvider; no network; no filesystem. The kernel is responsible for
 * the prompt + JSON parsing + HTML rendering + warning emission; the
 * tests pin each of those.
 */

class StubAI implements AIProvider {
  public chatCalls = 0;
  public lastPrompt = '';
  public lastSystem: string | undefined;

  constructor(private readonly responses: string[]) {}

  async chat(prompt: string, opts?: ChatOpts): Promise<string> {
    this.lastPrompt = prompt;
    this.lastSystem = opts?.system;
    const response = this.responses[this.chatCalls];
    this.chatCalls += 1;
    if (response === undefined) {
      throw new Error(`StubAI: no chat response staged for call ${this.chatCalls}`);
    }
    return response;
  }

  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    throw new Error('StubAI.ask: not used in 011 spec tests');
  }

  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('StubAI.subagent: not used in 011 spec tests');
  }
}

const ctxFrom = (ai: AIProvider): KernelContext => ({ cwd: '/tmp/test', ai });

const validSpecJson = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    tldr: 'A one-line summary of the feature.',
    smallestDemoable: 'A user can do the thing end-to-end in under 60 seconds.',
    stories: [
      {
        id: 'US1',
        title: 'Author a spec',
        role: 'spec author',
        want: 'commit to discrete decisions',
        outcome: 'no unresolved questions leak',
        acceptance: 'spec.html has zero <spec-question> blocks.',
        priority: 'P1',
      },
    ],
    frs: [
      { id: 'FR-001', priority: 'must', body: 'The kernel MUST emit a spec ID.' },
      { id: 'FR-002', priority: 'should', body: 'The kernel SHOULD surface smallest-demoable.' },
    ],
    nfrs: [
      { id: 'NFR-001', priority: 'must', body: 'Rendering MUST be deterministic.' },
    ],
    scs: [
      { id: 'SC-001', priority: 'must', body: 'Spec opens cleanly in a browser.' },
    ],
    ...overrides,
  });

describe('specCommand (011 FR-* via spec)', () => {
  it('happy path: renders spec ID, requirements, draft status pill, and changelog', async () => {
    const ai = new StubAI([validSpecJson()]);
    const result = await specCommand(
      { description: 'add a spec kernel' },
      ctxFrom(ai),
    );

    expect(result.specId).toBe('000-add-a-spec-kernel');
    expect(result.html).toContain('000-add-a-spec-kernel');
    expect(result.html).toContain('<spec-status value="draft">Draft</spec-status>');
    expect(result.html).toContain('FR-001');
    expect(result.html).toContain('NFR-001');
    expect(result.html).toContain('SC-001');
    expect(result.html).toContain('<spec-changelog>');
    expect(result.html).toContain('Initial draft authored via specCommand');
    // 045-artifact-security T-102: the kernel's own generated <head> carries the
    // open-time CSP gate too, not just the file-based templates/spec.html.
    expect(result.html).toContain('Content-Security-Policy');
    expect(result.warnings).toEqual([]);
  });

  it('surfaces smallest-demoable in spec-meta (FR-006)', async () => {
    const ai = new StubAI([
      validSpecJson({
        smallestDemoable: 'Author one spec end-to-end with no manual HTML editing.',
      }),
    ]);
    const result = await specCommand(
      { description: 'demoable surfacing' },
      ctxFrom(ai),
    );

    expect(result.html).toContain('<b>Smallest demoable</b>');
    expect(result.html).toContain('Author one spec end-to-end with no manual HTML editing.');
  });

  it('requirementsCount sums frs + nfrs + scs', async () => {
    const ai = new StubAI([
      JSON.stringify({
        tldr: 't',
        smallestDemoable: 'sd',
        stories: [],
        frs: [
          { id: 'FR-001', priority: 'must', body: 'a' },
          { id: 'FR-002', priority: 'must', body: 'b' },
          { id: 'FR-003', priority: 'should', body: 'c' },
        ],
        nfrs: [
          { id: 'NFR-001', priority: 'must', body: 'd' },
          { id: 'NFR-002', priority: 'should', body: 'e' },
        ],
        scs: [
          { id: 'SC-001', priority: 'must', body: 'f' },
        ],
      }),
    ]);
    const result = await specCommand(
      { description: 'count test' },
      ctxFrom(ai),
    );

    expect(result.requirementsCount).toBe(6);
  });

  it('emits over-budget warning when requirementsCount > 20', async () => {
    const mkReq = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
        priority: 'must',
        body: `req ${i + 1}`,
      }));
    const ai = new StubAI([
      JSON.stringify({
        tldr: 't',
        smallestDemoable: 'sd',
        stories: [],
        frs: mkReq('FR', 15),
        nfrs: mkReq('NFR', 5),
        scs: mkReq('SC', 5),
      }),
    ]);
    const result = await specCommand(
      { description: 'over-budget' },
      ctxFrom(ai),
    );

    expect(result.requirementsCount).toBe(25);
    expect(result.warnings).toContain(
      'requirements count 25 exceeds 20 — consider splitting',
    );
  });

  it('emits warning when smallestDemoable is missing from AI response', async () => {
    const ai = new StubAI([
      JSON.stringify({
        tldr: 't',
        // smallestDemoable intentionally omitted
        stories: [],
        frs: [{ id: 'FR-001', priority: 'must', body: 'a' }],
        nfrs: [],
        scs: [],
      }),
    ]);
    const result = await specCommand(
      { description: 'missing demoable' },
      ctxFrom(ai),
    );

    expect(result.warnings).toContain(
      'smallest-demoable not surfaced; spec interview may have failed',
    );
  });

  it('throws when ctx.ai is undefined', async () => {
    await expect(
      specCommand({ description: 'x' }, { cwd: '/tmp' }),
    ).rejects.toThrow(/specCommand requires ctx\.ai/);
  });

  it('re-entry mode: prompt includes "Sharpen this existing spec" and existing content', async () => {
    const ai = new StubAI([validSpecJson()]);
    const existing = '<html><body><h1>existing</h1></body></html>';
    const result = await specCommand(
      {
        description: 're-entry pass',
        specId: '042-revisited',
        existingSpec: existing,
      },
      ctxFrom(ai),
    );

    expect(ai.lastPrompt).toContain('Sharpen this existing spec');
    expect(ai.lastPrompt).toContain('existing</h1>');
    expect(result.specId).toBe('042-revisited');
    expect(result.html).toContain('Re-entry: spec sharpened via specCommand');
  });
});
