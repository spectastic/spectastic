import { describe, expect, it } from 'vitest';
import { proposeCommand } from '@spectastic/core/commands/propose';
import type {
  AIProvider,
  ChatOpts,
  KernelContext,
  Question,
  SubagentOpts,
  SubagentResult,
} from '@spectastic/core';

/**
 * Unit tests for proposeCommand. Per 013-core-propose plan:
 * adversarial pass auto-fires when must-tier touched OR removed-op
 * present OR ≥2 topic prefixes; author can override via
 * input.adversarial = true | false. Risks are defensively forced to
 * status="identified" regardless of subagent output (D-005).
 *
 * Stubs AIProvider; no network; no filesystem.
 */

interface StubChatResponse {
  json: Record<string, unknown>;
}

interface StubSubagentResponse {
  output: string;
}

class StubAI implements AIProvider {
  public chatCalls = 0;
  public subagentCalls: Array<{ prompt: string; opts?: SubagentOpts }> = [];
  public askCalls: Question[][] = [];

  constructor(
    private readonly chatResponses: StubChatResponse[],
    private readonly subagentResponses: StubSubagentResponse[] = [],
  ) {}

  async chat(_prompt: string, _opts?: ChatOpts): Promise<string> {
    const response = this.chatResponses[this.chatCalls];
    this.chatCalls += 1;
    if (!response) throw new Error(`StubAI: no chat response for call ${this.chatCalls}`);
    return JSON.stringify(response.json);
  }

  async ask<TResult extends Record<string, string>>(
    questions: ReadonlyArray<Question>,
  ): Promise<TResult> {
    this.askCalls.push([...questions]);
    throw new Error('StubAI.ask: not used in 013 tests');
  }

  async subagent(prompt: string, opts?: SubagentOpts): Promise<SubagentResult> {
    this.subagentCalls.push({ prompt, opts });
    const response = this.subagentResponses[this.subagentCalls.length - 1];
    if (!response) throw new Error('StubAI.subagent: no response staged');
    return { output: response.output };
  }
}

const ctxFrom = (ai: AIProvider): KernelContext => ({ cwd: '/tmp/test', ai });

const SPEC_WITH_MUST = `<!doctype html><html><body>
<spec-requirement id="FR-001" priority="must"><p>Original must-tier requirement.</p></spec-requirement>
<spec-requirement id="FR-002" priority="should"><p>A should-tier requirement.</p></spec-requirement>
</body></html>`;

const SPEC_NO_MUST = `<!doctype html><html><body>
<spec-requirement id="FR-100" priority="should"><p>Soft requirement only.</p></spec-requirement>
</body></html>`;

describe('proposeCommand (013)', () => {
  it('base propose with no adversarial fire returns zero risks', async () => {
    const ai = new StubAI([
      {
        json: {
          intent: 'Tighten FR-100 wording.',
          scope: 'One requirement.',
          approach: 'Reword.',
          deltas: [
            {
              op: 'modified',
              target: 'FR-100',
              postState: 'Reworded soft requirement.',
              reason: 'Clarity pass.',
            },
          ],
        },
      },
    ]);

    const result = await proposeCommand(
      {
        specId: '001-demo',
        description: 'Reword FR-100 for clarity',
        specHtml: SPEC_NO_MUST,
        adversarial: false,
      },
      ctxFrom(ai),
    );

    expect(result.deltasCount).toBe(1);
    expect(result.risks).toEqual([]);
    expect(ai.subagentCalls).toHaveLength(0);
    expect(result.html).not.toContain('<spec-risk');
  });

  it('adversarial fires on removed-op delta', async () => {
    const ai = new StubAI(
      [
        {
          json: {
            intent: 'Drop FR-100.',
            scope: 'One removal.',
            approach: 'Delete and migrate callers.',
            deltas: [
              {
                op: 'removed',
                target: 'FR-100',
                reason: 'Obsolete.',
                migration: 'None — no callers.',
              },
            ],
          },
        },
      ],
      [
        {
          output: JSON.stringify({
            risks: [
              { target: 'FR-100', concern: 'Callers may exist that we missed.' },
              { target: 'FR-100', concern: 'Documentation references remain.' },
              { target: 'FR-100', concern: 'Audit trail will lose context.' },
            ],
          }),
        },
      ],
    );

    const result = await proposeCommand(
      {
        specId: '001-demo',
        description: 'Remove FR-100',
        specHtml: SPEC_NO_MUST,
      },
      ctxFrom(ai),
    );

    expect(ai.subagentCalls).toHaveLength(1);
    expect(result.risks).toHaveLength(3);
    expect(result.html).toContain('<spec-risk');
    expect(result.html).toContain('status="identified"');
  });

  it('adversarial fires when deltas span ≥2 topic prefixes', async () => {
    const ai = new StubAI(
      [
        {
          json: {
            intent: 'Cross-topic change.',
            scope: 'Two topics.',
            approach: 'Coordinated edit.',
            deltas: [
              {
                op: 'modified',
                target: 'REQ-AUTH-001',
                postState: 'Tightened auth requirement.',
              },
              {
                op: 'modified',
                target: 'REQ-LIFECYCLE-002',
                postState: 'Adjusted lifecycle requirement.',
              },
            ],
          },
        },
      ],
      [
        {
          output: JSON.stringify({
            risks: [
              { target: 'REQ-AUTH-001', concern: 'Auth tightening may break sessions.' },
              { target: 'REQ-LIFECYCLE-002', concern: 'Lifecycle ripple effects.' },
              { target: 'cross', concern: 'Coordination cost across topics.' },
            ],
          }),
        },
      ],
    );

    const result = await proposeCommand(
      {
        specId: '001-demo',
        description: 'Cross-topic adjustment',
        specHtml: SPEC_NO_MUST,
      },
      ctxFrom(ai),
    );

    expect(ai.subagentCalls).toHaveLength(1);
    expect(result.deltasCount).toBe(2);
    expect(result.risks).toHaveLength(3);
  });

  it('adversarial fires when a delta touches a must-tier requirement', async () => {
    const ai = new StubAI(
      [
        {
          json: {
            intent: 'Sharpen FR-001.',
            scope: 'One must-tier req.',
            approach: 'Reword.',
            deltas: [
              {
                op: 'modified',
                target: 'FR-001',
                postState: 'Tightened must-tier requirement.',
                reason: 'Ambiguity.',
              },
            ],
          },
        },
      ],
      [
        {
          output: JSON.stringify({
            risks: [
              { target: 'FR-001', concern: 'Rewording may shift semantics.' },
              { target: 'FR-001', concern: 'Downstream tests may need updates.' },
              { target: 'FR-001', concern: 'Audit consumers expect old wording.' },
            ],
          }),
        },
      ],
    );

    const result = await proposeCommand(
      {
        specId: '001-demo',
        description: 'Sharpen FR-001',
        specHtml: SPEC_WITH_MUST,
      },
      ctxFrom(ai),
    );

    expect(ai.subagentCalls).toHaveLength(1);
    expect(result.risks).toHaveLength(3);
  });

  it('defensively forces risk status to "identified" regardless of subagent output', async () => {
    const ai = new StubAI(
      [
        {
          json: {
            intent: 'Drop FR-100.',
            scope: 'Removal.',
            approach: 'Delete.',
            deltas: [{ op: 'removed', target: 'FR-100', reason: 'Stale.' }],
          },
        },
      ],
      [
        {
          output: JSON.stringify({
            risks: [
              { target: 'FR-100', concern: 'A', status: 'accepted' },
              { target: 'FR-100', concern: 'B', status: 'mitigated' },
              { target: 'FR-100', concern: 'C', status: 'rejected' },
            ],
          }),
        },
      ],
    );

    const result = await proposeCommand(
      {
        specId: '001-demo',
        description: 'Remove FR-100',
        specHtml: SPEC_NO_MUST,
      },
      ctxFrom(ai),
    );

    expect(result.risks).toHaveLength(3);
    for (const r of result.risks) {
      expect(r.status).toBe('identified');
    }
  });

  it('explicit adversarial=false overrides heuristic even on removed-op', async () => {
    const ai = new StubAI([
      {
        json: {
          intent: 'Drop FR-100.',
          scope: 'Removal.',
          approach: 'Delete.',
          deltas: [{ op: 'removed', target: 'FR-100', reason: 'Stale.' }],
        },
      },
    ]);

    const result = await proposeCommand(
      {
        specId: '001-demo',
        description: 'Remove FR-100',
        specHtml: SPEC_NO_MUST,
        adversarial: false,
      },
      ctxFrom(ai),
    );

    expect(ai.subagentCalls).toHaveLength(0);
    expect(result.risks).toEqual([]);
    expect(result.deltasCount).toBe(1);
  });

  it('throws when ctx.ai is undefined', async () => {
    await expect(
      proposeCommand(
        {
          specId: '001-demo',
          description: 'noop',
          specHtml: SPEC_NO_MUST,
        },
        { cwd: '/tmp' },
      ),
    ).rejects.toThrow(/proposeCommand requires ctx\.ai/);
  });
});
