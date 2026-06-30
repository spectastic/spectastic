import { describe, it, expect } from 'vitest';
import { orderCommand, CycleError } from '../commands/order.js';
import type { CorpusEntry } from './types.js';

/**
 * US2 (T-200): a precedence cycle yields no order and a diagnostic naming the
 * specs on the cycle (FR-005, SC-002).
 */

/** An edge P→C needs C to name P as <spec-parent> AND P to defer-to C. */
function mkSpec(id: string, parent: string, deferTo: string): CorpusEntry {
  return {
    specId: id,
    html: `<!doctype html><html><body><h1>${id}</h1><spec-parent specid="${parent}"></spec-parent><spec-out-of-scope><ul><li defer-to="${deferTo}">x</li></ul></spec-out-of-scope></body></html>`,
  };
}

/** Both sides name each other as parent AND defer to each other → 2-cycle. */
function reciprocal(id: string, other: string): CorpusEntry {
  return mkSpec(id, other, other);
}

describe('cycle handling', () => {
  it('throws CycleError naming both nodes on a 2-cycle and emits no order', async () => {
    const corpus = [reciprocal('001-a', '002-b'), reciprocal('002-b', '001-a')];
    await expect(orderCommand({ corpus }, { cwd: '.' })).rejects.toBeInstanceOf(CycleError);
    try {
      await orderCommand({ corpus }, { cwd: '.' });
    } catch (err) {
      const e = err as CycleError;
      expect(e.cycle).toEqual(expect.arrayContaining(['001-a', '002-b']));
      expect(e.message).toContain('001-a');
      expect(e.message).toContain('002-b');
    }
  });

  it('reports the offending nodes for a 3-cycle (001→002→003→001)', async () => {
    // edge 001→002 (002.parent=001, 001.defer=002); 002→003; 003→001.
    const corpus = [
      mkSpec('001-a', '003-c', '002-b'),
      mkSpec('002-b', '001-a', '003-c'),
      mkSpec('003-c', '002-b', '001-a'),
    ];
    await expect(orderCommand({ corpus }, { cwd: '.' })).rejects.toThrow(CycleError);
  });
});
