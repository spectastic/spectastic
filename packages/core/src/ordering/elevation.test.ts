import { describe, it, expect } from 'vitest';
import { orderCommand } from '../commands/order.js';
import type { CorpusEntry } from './types.js';

/**
 * US3 (T-300): a cheap foundation that unblocks high value ranks ahead of a
 * higher-own-value leaf (FR-004, SC-003), and the WSJF cross-check flags the
 * divergence the leverage creates (FR-008).
 */

interface SpecOpts {
  parent?: string;
  deferTo?: string[];
  rice?: [number, number, number, number];
}
function mkSpec(id: string, o: SpecOpts = {}): CorpusEntry {
  const parent = o.parent ? `<spec-parent specid="${o.parent}"></spec-parent>` : '';
  const defers = (o.deferTo ?? []).map((t) => `<li defer-to="${t}">x</li>`).join('');
  const oos = defers ? `<spec-out-of-scope><ul>${defers}</ul></spec-out-of-scope>` : '';
  const rice = o.rice
    ? `<spec-rice reach="${o.rice[0]}" impact="${o.rice[1]}" confidence="${o.rice[2]}" effort="${o.rice[3]}"></spec-rice>`
    : '';
  return { specId: id, html: `<!doctype html><html><body><h1>${id}</h1>${parent}${oos}${rice}</body></html>` };
}

describe('foundation elevation + WSJF cross-check', () => {
  it('lifts a low-own-value foundation above a higher-own-value leaf by subtree value', async () => {
    const corpus = [
      mkSpec('001-foundation', { deferTo: ['002-big'], rice: [4, 4, 1, 2] }), // own value 8, unblocks 100
      mkSpec('002-big', { parent: '001-foundation', rice: [10, 10, 1, 1] }), // value 100
      mkSpec('003-leaf', { rice: [3, 3, 1, 1] }), // own value 9, unblocks nothing
    ];
    const { ids, ordering } = await orderCommand({ corpus }, { cwd: '.' });
    const pos = (id: string): number => ids.indexOf(id);
    // Foundation (own value 8 < leaf's 9) still ranks ahead of the leaf, by elevation.
    expect(pos('001-foundation')).toBeLessThan(pos('003-leaf'));
    expect(ordering.entries.find((e) => e.specId === '001-foundation')?.tag).toBe('elevated');
  });

  it('flags the RICE-vs-WSJF rank divergence the leverage produces (FR-008)', async () => {
    const corpus = [
      mkSpec('001-foundation', { deferTo: ['002-big'], rice: [4, 4, 1, 2] }),
      mkSpec('002-big', { parent: '001-foundation', rice: [10, 10, 1, 1] }),
      mkSpec('003-leaf', { rice: [3, 3, 1, 1] }),
    ];
    const { ordering } = await orderCommand({ corpus }, { cwd: '.' });
    const by = (id: string) => ordering.entries.find((e) => e.specId === id)!;
    // RICE ranks leaf(9) above foundation(8); WSJF folds leverage and inverts them.
    expect(by('001-foundation').diverges).toBe(true);
    expect(by('003-leaf').diverges).toBe(true);
    expect(by('002-big').diverges).toBe(false);
    expect(by('001-foundation').wsjf).toBeGreaterThan(by('003-leaf').wsjf!);
  });
});
