import { describe, expect, it } from 'vitest';
import { createAIProvider } from '../src/ai-factory.js';

/**
 * Spec 044 NFR-002 / SC-004 — the resolved alias→id table names models the real
 * Anthropic API actually accepts (a stale id would 400). LOCAL-ONLY: it makes a
 * genuine LLM call (cost + auth via ANTHROPIC_API_KEY), so it self-skips unless
 * SPECTASTIC_MODEL_SMOKE=1. CI never runs it (stub posture); resolution itself is
 * covered deterministically by ai-factory-model.test.ts.
 */
const RUN = process.env['SPECTASTIC_MODEL_SMOKE'] === '1';

describe.skipIf(!RUN)('verb model policy — real-model resolution smoke (local-only)', () => {
  it('resolves haiku and the id is accepted by a live call', async () => {
    const ai = await createAIProvider({ verb: 'spec', override: 'haiku' });
    expect(ai.model).toBe('claude-haiku-4-5');
    const reply = await ai.chat('Reply with exactly: OK', { maxTokens: 16 });
    expect(reply.trim().length).toBeGreaterThan(0);
  }, 30_000);
});
