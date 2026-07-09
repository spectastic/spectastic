import { describe, expect, it } from 'vitest';
import { mapPool } from '@spectastic/core/commands/triage';

/** Unit tests for the bounded-concurrency pool (spec 032-triage-fanout, plan D-002). */
describe('mapPool (032 D-002)', () => {
  it('returns results in input order despite reverse completion order (FR-002)', async () => {
    const delays = [40, 30, 20, 10, 0]; // later items finish first
    const out = await mapPool(
      delays,
      async (d, i) => {
        await new Promise((r) => setTimeout(r, d));
        return i;
      },
      8,
    );
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it('never exceeds the concurrency cap, yet runs in parallel (FR-007/NFR-001)', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapPool(
      items,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight -= 1;
        return 0;
      },
      4,
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('handles an empty list', async () => {
    expect(await mapPool([], async () => 1, 8)).toEqual([]);
  });
});
