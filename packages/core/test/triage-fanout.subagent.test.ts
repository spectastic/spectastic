import { describe, expect, it } from 'vitest';
import { triageFanout } from '@spectastic/core/commands/triage';
import type { TriageInput } from '@spectastic/core';
import { KeyedStubAI, type KeyedResponse } from './helpers/keyed-stub.js';

/**
 * The Workflow backend carries a runtime; per spec 032 NFR-002 (principle P-7)
 * it must be exercised behaviourally — a real multi-item run in `subagent` mode,
 * not a structural check that the code path exists.
 */

const base: TriageInput = { description: '', startingIdT: 0, startingIdI: 0 };

function card(over: Record<string, unknown>): Record<string, unknown> {
  return {
    headline: 'h',
    layer: 'just-do',
    layerConfidence: 'high',
    expected: 'e',
    actual: 'a',
    diagnosis: 'd',
    fix: 'f',
    ...over,
  };
}

describe('triageFanout · subagent backend (032 NFR-002, P-7)', () => {
  it('fans out one subagent per item, concurrently, in input order — using subagent not chat', async () => {
    const items = ['sa alpha', 'sa beta', 'sa gamma', 'sa delta'];
    const responses: KeyedResponse[] = items.map((it, i) => ({
      match: it,
      delayMs: 25,
      json: card({ headline: `sa${i}`, layer: 'just-do' }),
    }));
    const ai = new KeyedStubAI(responses);

    const cards = await triageFanout(items, base, ai, { concurrency: 8, backend: 'subagent' });

    expect(cards.map((c) => c.headline)).toEqual(['sa0', 'sa1', 'sa2', 'sa3']);
    expect(cards.map((c) => c.id)).toEqual(['I-001', 'I-002', 'I-003', 'I-004']);
    // The subagent path ran — not chat — and it fanned out.
    expect(ai.subagentCalls).toBe(4);
    expect(ai.chatCalls).toBe(0);
    expect(ai.observedMaxConcurrency).toBeGreaterThan(1);
  });
});
