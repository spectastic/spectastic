import type { TriageInput } from '@spectastic/core';
import { triageFanout } from '@spectastic/core/commands/triage';
import { describe, expect, it } from 'vitest';
import { type KeyedResponse, KeyedStubAI } from './helpers/keyed-stub.js';

/**
 * Behavioural tests for the list-intake fan-out engine (spec 032-triage-fanout).
 * These RUN the concurrent engine and assert observable behaviour — ordering,
 * timing, the batched gate, failure isolation — not merely that it is present
 * (principle P-7).
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

describe('triageFanout (032 US1 · fan out a pasted list)', () => {
  it('emits N input-ordered cards with correct I-/T- ids, stable across runs despite reverse completion (SC-002, FR-002/003)', async () => {
    const items = ['alpha just-do', 'beta spec', 'gamma just-do', 'delta impl'];
    const responses: KeyedResponse[] = [
      {
        match: 'alpha',
        delayMs: 40,
        json: card({ headline: 'A', layer: 'just-do' }),
      },
      {
        match: 'beta',
        delayMs: 10,
        json: card({ headline: 'B', layer: 'spec', regenResult: 'fail' }),
      },
      {
        match: 'gamma',
        delayMs: 30,
        json: card({ headline: 'C', layer: 'just-do' }),
      },
      {
        match: 'delta',
        delayMs: 0,
        json: card({
          headline: 'D',
          layer: 'implementation',
          regenResult: 'pass',
        }),
      },
    ];
    const run = () => triageFanout(items, base, new KeyedStubAI(responses), { concurrency: 8 });

    const a = await run();
    const b = await run();

    // Input order preserved even though completion order is delta, beta, gamma, alpha.
    expect(a.map((c) => c.headline)).toEqual(['A', 'B', 'C', 'D']);
    expect(a.map((c) => c.id)).toEqual(['I-001', 'T-001', 'I-002', 'T-002']);
    expect(a).toHaveLength(items.length);
    // Deterministic across repeated runs on the same input.
    expect(b.map((c) => c.id)).toEqual(a.map((c) => c.id));
    expect(b.map((c) => c.headline)).toEqual(a.map((c) => c.headline));
  });

  it('classifies concurrently — wall-clock bounded by the slowest item, not the serial sum (SC-001)', async () => {
    const items = Array.from({ length: 8 }, (_, i) => `item ${i} slow`);
    const responses: KeyedResponse[] = items.map((_, i) => ({
      match: `item ${i} slow`,
      delayMs: 100,
      json: card({ headline: `h${i}`, layer: 'just-do' }),
    }));
    const ai = new KeyedStubAI(responses);

    const t0 = performance.now();
    const cards = await triageFanout(items, base, ai, { concurrency: 8 });
    const elapsed = performance.now() - t0;

    expect(cards).toHaveLength(8);
    // 8 × 100 ms serial ≈ 800 ms; bounded fan-out completes in ≈ one item's time.
    expect(elapsed).toBeLessThan(350);
    expect(ai.observedMaxConcurrency).toBe(8);
  });

  it('honours the concurrency cap — never more than `concurrency` in flight (FR-007/NFR-001)', async () => {
    const items = Array.from({ length: 12 }, (_, i) => `capped ${i} x`);
    const responses: KeyedResponse[] = items.map((_, i) => ({
      match: `capped ${i} x`,
      delayMs: 30,
      json: card({ headline: `c${i}`, layer: 'just-do' }),
    }));
    const ai = new KeyedStubAI(responses);
    await triageFanout(items, base, ai, { concurrency: 3 });
    expect(ai.observedMaxConcurrency).toBeLessThanOrEqual(3);
    expect(ai.observedMaxConcurrency).toBeGreaterThan(1);
  });
});

describe('triageFanout (032 US2 · decide the ambiguous ones in one pass)', () => {
  it('resolves hedged items in one consolidated gate AFTER the pass; confident items skip it (SC-004, FR-005/006)', async () => {
    const items = ['confident one', 'hedged two', 'confident three'];
    const responses: KeyedResponse[] = [
      {
        match: 'confident one',
        json: card({
          headline: 'one',
          layer: 'spec',
          layerConfidence: 'high',
          regenResult: 'fail',
        }),
      },
      {
        match: 'hedged two',
        json: card({ headline: 'two', layer: 'spec', layerConfidence: 'low' }),
      },
      {
        match: 'confident three',
        json: card({
          headline: 'three',
          layer: 'just-do',
          layerConfidence: 'high',
        }),
      },
    ];
    // The single hedged item is gated: category → diagnostic, then layer → plan.
    const askResponses = [{ category: 'diagnostic' }, { layer: 'design' }];
    const ai = new KeyedStubAI(responses, askResponses);

    const cards = await triageFanout(items, base, ai, { concurrency: 8 });

    // Exactly one hedged item → two ask calls; confident items never reach the gate.
    expect(ai.askCalls).toHaveLength(2);
    expect(cards[1]?.headline).toBe('two');
    expect(cards[1]?.layer).toBe('design');
    // The gate ran after classification: every chat precedes the first ask (FR-005).
    const firstAsk = ai.callLog.indexOf('ask');
    const lastChat = ai.callLog.lastIndexOf('chat');
    expect(firstAsk).toBeGreaterThan(-1);
    expect(lastChat).toBeLessThan(firstAsk);
  });
});

describe('triageFanout (032 US3 · survive a bad item)', () => {
  it('a failed item still yields a flagged, gate-routed card; others land; N in → N out (SC-003, FR-004)', async () => {
    const items = ['good alpha', 'bad beta', 'good gamma'];
    const responses: KeyedResponse[] = [
      {
        match: 'good alpha',
        json: card({
          headline: 'alpha ok',
          layer: 'just-do',
          layerConfidence: 'high',
        }),
      },
      { match: 'bad beta', throws: true },
      {
        match: 'good gamma',
        json: card({
          headline: 'gamma ok',
          layer: 'just-do',
          layerConfidence: 'high',
        }),
      },
    ];
    // The failed item routes to the gate; stage its resolution (routing → just-do).
    const askResponses = [{ category: 'routing' }, { layer: 'just-do' }];
    const ai = new KeyedStubAI(responses, askResponses);

    const cards = await triageFanout(items, base, ai, { concurrency: 8 });

    expect(cards).toHaveLength(3);
    expect(cards[0]?.headline).toBe('alpha ok');
    expect(cards[2]?.headline).toBe('gamma ok');
    // The failed item is flagged for review and gate-resolved, never dropped.
    expect(cards[1]?.headline).toContain('Classification failed');
    expect(cards[1]?.layer).toBe('just-do');
    expect(cards.map((c) => c.id)).toEqual(['I-001', 'I-002', 'I-003']);
  });
});
